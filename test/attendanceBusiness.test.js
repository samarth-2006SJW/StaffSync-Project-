const test = require("node:test");
const assert = require("node:assert/strict");
const Attendance = require("../Models/Attendance");
const Employee = require("../Models/Employee");
const controller = require("../Controllers/attendanceController");

const originalFind = Employee.find;
const restore = () => { Employee.find = originalFind; };
test.afterEach(restore);

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("HR name lookup rejects duplicate profile names with safe candidate identifiers", async () => {
  Employee.find = () => ({
    select: async () => [
      { _id: "profile-a", user: "user-a" },
      { _id: "profile-b", user: "user-b" },
    ],
  });
  const res = response();
  await controller.getAttendance({
    user: { id: "hr-id", role: "HR", name: "HR" },
    query: { name: "Alex Smith", date: "2026-10-27" },
  }, res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body.candidates, [
    { employee: "profile-a", user: "user-a" },
    { employee: "profile-b", user: "user-b" },
  ]);
});

test("date coverage uses Employee profiles and labels missing records as not recorded", async () => {
  const originalAttendanceFind = Attendance.find;
  const originalPopulate = Attendance.Query?.prototype?.populate;
  try {
    Attendance.find = () => ({ sort: () => ({ populate: async () => [
      { user: { _id: "user-a", name: "Alex" }, status: "Present" },
    ] }) });
    Employee.find = () => ({
      select() { return this; },
      sort: async () => [
        { _id: "profile-a", user: "user-a", name: "Alex", email: "alex@example.com" },
        { _id: "profile-b", user: "user-b", name: "Bea", email: "bea@example.com" },
      ],
    });
    const res = response();
    await controller.getAttendance({
      user: { id: "hr-id", role: "HR", name: "HR" },
      query: { date: "2026-10-27" },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.count, 1);
    assert.deepEqual(res.body.missingAttendance, [
      { employee: { _id: "profile-b", user: "user-b", name: "Bea", email: "bea@example.com" }, attendanceStatus: "Not recorded" },
    ]);
  } finally {
    Attendance.find = originalAttendanceFind;
    if (originalPopulate) Attendance.Query.prototype.populate = originalPopulate;
  }
});
