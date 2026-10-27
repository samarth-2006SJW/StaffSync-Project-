const mongoose = require("mongoose");
require("dotenv").config();

require("../Models/User");
require("../Models/Employee");
require("../Models/Attendance");

const mappings = [
  { source: "users", destination: "Users", model: "User" },
  { source: "employees", destination: "Employees", model: "Employee" },
  { source: "attendances", destination: "Attendance", model: "Attendance" },
  { source: null, destination: "LeaveRequests" },
  { source: null, destination: "Announcements" },
  { source: null, destination: "TrainingPrograms" },
];

const modelForCollection = Object.fromEntries(
  mappings.filter((mapping) => mapping.model).map((mapping) => [
    mapping.destination,
    mongoose.model(mapping.model),
  ])
);

const stableJson = (value) => JSON.stringify(value, (_key, entry) => {
  if (
    entry && typeof entry === "object" && !Array.isArray(entry) &&
    !(entry instanceof Date) && !(entry._bsontype === "ObjectId")
  ) {
    return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)));
  }
  return entry;
});

const collectionExists = async (db, name) =>
  db.listCollections({ name }, { nameOnly: true }).hasNext();

const detectConflicts = (source, destination, model) => {
  const destinationById = new Map(destination.map((document) => [String(document._id), document]));
  const conflicts = source.filter((document) => {
    const existing = destinationById.get(String(document._id));
    return existing && stableJson(existing) !== stableJson(document);
  }).map((document) => String(document._id));
  const uniqueIndexConflicts = [];

  for (const [keys, options] of model.schema.indexes()) {
    if (!options.unique) continue;
    const keyFields = Object.keys(keys);
    const seen = new Map();
    for (const document of [...destination, ...source]) {
      const key = stableJson(keyFields.map((field) => document[field]));
      const previous = seen.get(key);
      if (previous && String(previous._id) !== String(document._id)) {
        uniqueIndexConflicts.push({
          index: keyFields.join("_"),
          documents: [String(previous._id), String(document._id)],
        });
      } else if (!previous) {
        seen.set(key, document);
      }
    }
  }

  return { destinationById, conflicts, uniqueIndexConflicts };
};

const inspect = async (db, mapping) => {
  const targetExists = await collectionExists(db, mapping.destination);
  const destination = targetExists
    ? await db.collection(mapping.destination).find({}).toArray()
    : [];

  if (!mapping.source) {
    return {
      sourceName: null,
      destinationName: mapping.destination,
      sourceCount: 0,
      destinationCount: destination.length,
      identicalExistingCount: 0,
      pendingCopyCount: 0,
      conflicts: [],
      uniqueIndexConflicts: [],
      sourceMissing: false,
      createEmptyCollection: !targetExists,
    };
  }

  const sourceExists = await collectionExists(db, mapping.source);
  if (!sourceExists) {
    return {
      sourceName: mapping.source,
      destinationName: mapping.destination,
      sourceCount: 0,
      destinationCount: destination.length,
      identicalExistingCount: 0,
      pendingCopyCount: 0,
      conflicts: [],
      uniqueIndexConflicts: [],
      sourceMissing: true,
      createEmptyCollection: false,
    };
  }

  const source = await db.collection(mapping.source).find({}).toArray();
  const { destinationById, conflicts, uniqueIndexConflicts } = detectConflicts(
    source,
    destination,
    modelForCollection[mapping.destination]
  );
  const pendingCopyCount = source.filter((document) =>
    !destinationById.has(String(document._id))
  ).length;

  return {
    sourceName: mapping.source,
    destinationName: mapping.destination,
    sourceCount: source.length,
    destinationCount: destination.length,
    identicalExistingCount: source.length - conflicts.length - pendingCopyCount,
    pendingCopyCount,
    conflicts,
    uniqueIndexConflicts,
    sourceMissing: false,
    createEmptyCollection: false,
  };
};

const assertReferences = async (db, employeeCollection, attendanceCollection, userCollection) => {
  const userIds = new Set((await db.collection(userCollection).find({}, { projection: { _id: 1 } }).toArray())
    .map((user) => String(user._id)));
  const errors = [];
  for (const collectionName of [employeeCollection, attendanceCollection]) {
    const documents = await db.collection(collectionName).find({}, { projection: { _id: 1, user: 1 } }).toArray();
    for (const document of documents) {
      if (!userIds.has(String(document.user))) {
        errors.push({ collection: collectionName, documentId: String(document._id) });
      }
    }
  }
  return errors;
};

const verifyIndexes = async (db, collectionName, model) => {
  const actualIndexes = await db.collection(collectionName).indexes();
  for (const [key, options] of model.schema.indexes()) {
    const actual = actualIndexes.find((index) => stableJson(index.key) === stableJson(key));
    if (!actual || Boolean(actual.unique) !== Boolean(options.unique)) {
      throw new Error(`Target index verification failed for ${collectionName}: ${Object.keys(key).join("_")}`);
    }
  }
};

const verifyCopiedDocuments = async (db, mapping) => {
  if (!mapping.source) return;
  const source = await db.collection(mapping.source).find({}).toArray();
  const destination = await db.collection(mapping.destination).find({}).toArray();
  const destinationById = new Map(destination.map((document) => [String(document._id), document]));
  const mismatches = source.filter((document) =>
    stableJson(document) !== stableJson(destinationById.get(String(document._id)))
  ).map((document) => String(document._id));
  if (mismatches.length || destination.length < source.length) {
    throw new Error(`Post-copy identity verification failed for ${mapping.destination}; mismatched source IDs: ${mismatches.join(",")}`);
  }
};

const runMigration = async (db, { apply = false } = {}) => {
  if (db.databaseName !== "StaffSync") throw new Error("Connected database is not StaffSync; refusing migration");
  const reports = [];
  for (const mapping of mappings) reports.push(await inspect(db, mapping));

  const unsafeReports = reports.filter((report) =>
    report.conflicts.length || report.uniqueIndexConflicts.length || report.sourceMissing
  );
  if (unsafeReports.length) {
    return { mode: apply ? "apply" : "dry-run", database: db.databaseName, mappings: reports, safeToApply: false };
  }

  if (!apply) return { mode: "dry-run", database: db.databaseName, mappings: reports, safeToApply: true };

  const referenceConflicts = await assertReferences(db, "employees", "attendances", "users");
  if (referenceConflicts.length) {
    throw new Error(`Source references are invalid; no target writes performed (${referenceConflicts.length} orphan references)`);
  }

  // Create targets and indexes before copying documents. A failed unique-index
  // build therefore cannot leave a partially copied collection.
  for (const report of reports) {
    if (report.createEmptyCollection) await db.createCollection(report.destinationName);
    const model = modelForCollection[report.destinationName];
    if (model) await model.createIndexes();
  }

  for (const mapping of mappings.filter((entry) => entry.source)) {
    const latest = await inspect(db, mapping);
    if (latest.conflicts.length || latest.uniqueIndexConflicts.length || latest.sourceMissing) {
      throw new Error(`Source/target conflict detected before copying ${mapping.destination}; rerun dry-run`);
    }
    const source = await db.collection(mapping.source).find({}).toArray();
    const destination = db.collection(mapping.destination);
    const existingIds = new Set((await destination.find({}, { projection: { _id: 1 } }).toArray())
      .map((document) => String(document._id)));
    const missing = source.filter((document) => !existingIds.has(String(document._id)));
    if (missing.length) await destination.insertMany(missing, { ordered: true });
    await verifyCopiedDocuments(db, mapping);
  }

  for (const mapping of mappings.filter((entry) => entry.model)) {
    await verifyIndexes(db, mapping.destination, modelForCollection[mapping.destination]);
  }
  const targetReferenceConflicts = await assertReferences(db, "Employees", "Attendance", "Users");
  if (targetReferenceConflicts.length) {
    throw new Error(`Target reference verification failed (${targetReferenceConflicts.length} orphan references)`);
  }

  return { mode: "apply", database: db.databaseName, mappings: reports, safeToApply: true, verified: true };
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  const confirmedDatabase = process.argv.find((arg) => arg.startsWith("--confirm-database="))?.split("=")[1];
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
  if (apply && confirmedDatabase !== "StaffSync") throw new Error("Apply requires --confirm-database=StaffSync");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const result = await runMigration(mongoose.connection.db, { apply });
  console.log(JSON.stringify(result, null, 2));
  if (!result.safeToApply) throw new Error("Migration preflight found conflicts; no writes performed");
  if (apply && !result.verified) throw new Error("Migration did not complete verification");
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`Migration stopped: ${error.message}`);
    process.exitCode = 1;
  }).finally(async () => {
    await mongoose.disconnect();
  });
}

module.exports = {
  mappings,
  stableJson,
  inspect,
  detectConflicts,
  verifyIndexes,
  verifyCopiedDocuments,
  runMigration,
};
