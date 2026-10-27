const databaseNameFromUri = (uri) => {
  if (typeof uri !== "string" || !uri.trim()) {
    throw new Error("TEST_MONGO_URI must be configured explicitly");
  }

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("TEST_MONGO_URI is not a valid MongoDB URI");
  }

  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) {
    throw new Error("TEST_MONGO_URI must use the MongoDB URI scheme");
  }
  const encodedName = parsed.pathname.replace(/^\/+/, "").split("/")[0];
  if (!encodedName) throw new Error("TEST_MONGO_URI must name a dedicated test database");
  try {
    return decodeURIComponent(encodedName);
  } catch {
    throw new Error("TEST_MONGO_URI contains an invalid database name");
  }
};

const assertSafeTestDatabase = ({ testUri, appUri }) => {
  const testDatabaseName = databaseNameFromUri(testUri);
  if (testUri === appUri) {
    throw new Error("Test and application MongoDB URIs must be different");
  }
  if (testDatabaseName.toLowerCase() === "staffsync") {
    throw new Error("The existing StaffSync database cannot be used for integration tests");
  }
  if (!/(?:^|[_-])test$/i.test(testDatabaseName)) {
    throw new Error("Test database name must end with _test or -test");
  }
  if (appUri && databaseNameFromUri(appUri) === testDatabaseName) {
    throw new Error("Test database must differ from the application database name");
  }
  return testDatabaseName;
};

module.exports = { databaseNameFromUri, assertSafeTestDatabase };
