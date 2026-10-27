const test = require("node:test");
const assert = require("node:assert/strict");
const parseAttendanceDate = require("../utils/attendanceDate");

test("normalizes a calendar date to midnight UTC", () => {
  assert.equal(
    parseAttendanceDate("2026-10-26").toISOString(),
    "2026-10-26T00:00:00.000Z"
  );
});

test("normalizes date-times to their UTC calendar day", () => {
  assert.equal(
    parseAttendanceDate("2026-10-26T23:00:00-02:00").toISOString(),
    "2026-10-27T00:00:00.000Z"
  );
});

test("accepts leap days and rejects impossible calendar dates", () => {
  assert.equal(
    parseAttendanceDate("2024-02-29").toISOString(),
    "2024-02-29T00:00:00.000Z"
  );
  assert.equal(parseAttendanceDate("2026-02-29"), null);
  assert.equal(parseAttendanceDate("2026-02-30"), null);
  assert.equal(parseAttendanceDate("2026-02-30T00:00:00Z"), null);
});

test("rejects empty, malformed, and non-string input", () => {
  for (const value of [
    "",
    "not-a-date",
    "2026-2-6",
    "2026-10-26T12:00:00",
    "2026-10-26T25:00:00Z",
    null,
    20261026,
    {},
  ]) {
    assert.equal(parseAttendanceDate(value), null);
  }
});
