const test = require("node:test");
const assert = require("node:assert/strict");
const { databaseNameFromUri, assertSafeTestDatabase } = require("../utils/testDatabaseSafety");

test("test URI parser extracts only the database name", () => {
  assert.equal(databaseNameFromUri("mongodb://127.0.0.1:27018/StaffSync_test"), "StaffSync_test");
  assert.equal(databaseNameFromUri("mongodb+srv://example.test/college-test?retryWrites=true"), "college-test");
});

test("test database guard rejects missing, production, reused, and non-test URIs", () => {
  assert.throws(() => assertSafeTestDatabase({ testUri: "", appUri: "mongodb://localhost/StaffSync" }), /must be configured/);
  assert.throws(() => assertSafeTestDatabase({ testUri: "mongodb://localhost/StaffSync", appUri: "mongodb://localhost/StaffSync" }), /different/);
  assert.throws(() => assertSafeTestDatabase({ testUri: "mongodb://localhost/StaffSync", appUri: "mongodb://localhost/StaffSync-prod" }), /existing StaffSync/);
  assert.throws(() => assertSafeTestDatabase({ testUri: "mongodb://localhost/StaffSync_test", appUri: "mongodb://other-host/StaffSync_test" }), /database name/);
  assert.throws(() => assertSafeTestDatabase({ testUri: "mongodb://localhost/StaffSync-prod", appUri: "mongodb://localhost/production" }), /end with _test or -test/);
});

test("test database guard accepts only a separately named test database", () => {
  assert.equal(assertSafeTestDatabase({
    testUri: "mongodb://127.0.0.1:27018/StaffSync_test",
    appUri: "mongodb+srv://cluster.example/StaffSync",
  }), "StaffSync_test");
});
