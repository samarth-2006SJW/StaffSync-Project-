const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../Models/User");
const { mappings, stableJson, inspect, detectConflicts, runMigration } = require("../scripts/migrateCollectionNames");

const fakeDb = (collections = {}, databaseName = "StaffSync") => ({
  databaseName,
  listCollections(filter) {
    return { hasNext: async () => Object.hasOwn(collections, filter.name) };
  },
  collection(name) {
    return { find: () => ({ toArray: async () => collections[name] || [] }) };
  },
});

test("migration mappings preserve exact requested source and destination names", () => {
  assert.deepEqual(mappings, [
    { source: "users", destination: "Users", model: "User" },
    { source: "employees", destination: "Employees", model: "Employee" },
    { source: "attendances", destination: "Attendance", model: "Attendance" },
    { source: null, destination: "LeaveRequests" },
    { source: null, destination: "Announcements" },
    { source: null, destination: "TrainingPrograms" },
  ]);
});

test("migration comparison is deterministic for nested keys and BSON-like dates", () => {
  assert.equal(
    stableJson({ b: { z: 1, a: 2 }, a: new Date("2026-01-01T00:00:00Z") }),
    stableJson({ a: new Date("2026-01-01T00:00:00Z"), b: { a: 2, z: 1 } })
  );
});

test("dry-run reports pending copies and exact same-ID documents as idempotent", async () => {
  const user = { _id: "user-1", email: "one@example.test", name: "One" };
  const same = { _id: "user-1", name: "One", email: "one@example.test" };
  let report = await inspect(fakeDb({ users: [user] }), mappings[0]);
  assert.equal(report.pendingCopyCount, 1);
  assert.deepEqual(report.conflicts, []);

  report = await inspect(fakeDb({ users: [user], Users: [same] }), mappings[0]);
  assert.equal(report.identicalExistingCount, 1);
  assert.equal(report.pendingCopyCount, 0);
  assert.deepEqual(report.conflicts, []);
  assert.deepEqual(report.uniqueIndexConflicts, []);
});

test("migration preflight detects changed identities and unique-key duplicates", () => {
  const identity = detectConflicts(
    [{ _id: "same", email: "old@example.test" }],
    [{ _id: "same", email: "new@example.test" }],
    User
  );
  assert.deepEqual(identity.conflicts, ["same"]);

  const duplicate = detectConflicts(
    [{ _id: "one", email: "same@example.test" }],
    [{ _id: "two", email: "same@example.test" }],
    User
  );
  assert.ok(duplicate.uniqueIndexConflicts.some((conflict) => conflict.index === "email"));
});

test("migration refuses a non-StaffSync database and source-missing preflight is unsafe", async () => {
  await assert.rejects(runMigration(fakeDb({}, "StaffSync-test")), /not StaffSync/);
  const result = await runMigration(fakeDb({ Users: [] }));
  assert.equal(result.safeToApply, false);
  assert.ok(result.mappings.some((entry) => entry.sourceMissing));
});

test("empty-module targets are planned for creation without inventing source collections", async () => {
  const report = await inspect(fakeDb({}), mappings[3]);
  assert.equal(report.sourceName, null);
  assert.equal(report.createEmptyCollection, true);
  assert.equal(report.pendingCopyCount, 0);
});
