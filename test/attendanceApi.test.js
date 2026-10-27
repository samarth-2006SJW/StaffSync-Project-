const test = require("node:test");
const assert = require("node:assert/strict");
const Attendance = require("../Models/Attendance");
const User = require("../Models/User");
const controller = require("../Controllers/attendanceController");

const originals = {
  create: Attendance.create,
  findById: Attendance.findById,
  findByIdAndUpdate: Attendance.findByIdAndUpdate,
  findByIdAndDelete: Attendance.findByIdAndDelete,
  userFindById: User.findById,
};
test.afterEach(() => {
  Attendance.create = originals.create;
  Attendance.findById = originals.findById;
  Attendance.findByIdAndUpdate = originals.findByIdAndUpdate;
  Attendance.findByIdAndDelete = originals.findByIdAndDelete;
  User.findById = originals.userFindById;
});

const res = () => ({ statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const id = "6adf46aa4638ce2544efbdf4";
const fixture = { _id: "6adf63b86517594ce0672fd6", user: { _id: id, name: "Alex", email: "alex@example.com", role: "Employee" }, date: new Date("2026-10-27T00:00:00.000Z"), status: "Present" };

test("Attendance create validates input, links existing User, and returns populated record", async () => {
  let writes = 0;
  User.findById = async (userId) => userId === id ? { _id: id } : null;
  Attendance.create = async (document) => {
    writes++;
    assert.equal(document.user, id);
    assert.equal(document.date.toISOString(), "2026-10-27T00:00:00.000Z");
    assert.equal(document.checkInTime, "2026-10-27T09:00:00.000Z");
    assert.equal(document.checkOutTime, "2026-10-27T17:00:00.000Z");
    return { _id: fixture._id };
  };
  Attendance.findById = () => ({ populate: async () => fixture });

  for (const body of [null, [], {}, { user: "bad", date: "2026-10-27" }, { user: id, date: "2026-02-30" }, { user: id, date: "2026-10-27", checkInTime: "09:00" }, { user: id, date: "2026-10-27", checkOutTime: "2026-02-30T09:00:00Z" }, { user: id, date: "2026-10-27", status: "Holiday" }, { user: id, date: "2026-10-27", status: "" }]) {
    const response = res();
    await controller.createAttendance({ body }, response);
    assert.equal(response.statusCode, 400);
  }
  let response = res();
  await controller.createAttendance({ body: { user: id, date: "2026-10-27", checkInTime: "2026-10-27T09:00:00Z", checkOutTime: "2026-10-27T17:00:00.000Z", status: "Present" } }, response);
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data, fixture);
  assert.equal(writes, 1);

  User.findById = async () => null;
  response = res();
  await controller.createAttendance({ body: { user: id, date: "2026-10-27" } }, response);
  assert.equal(response.statusCode, 404);

  User.findById = async () => ({ _id: id });
  Attendance.create = async () => { const error = new Error("duplicate"); error.code = 11000; throw error; };
  response = res();
  await controller.createAttendance({ body: { user: id, date: "2026-10-27" } }, response);
  assert.equal(response.statusCode, 409);
});

test("Attendance update validates allowlisted fields and handles missing/duplicate records", async () => {
  let updates;
  Attendance.findByIdAndUpdate = (_recordId, fields, options) => { updates = { fields, options }; return { populate: async () => fixture }; };
  Attendance.findById = () => ({ populate: async () => fixture });
  let response = res();
  await controller.updateAttendance({ params: { id: fixture._id }, body: { checkInTime: "invalid" } }, response);
  assert.equal(response.statusCode, 400);
  response = res();
  await controller.updateAttendance({ params: { id: "bad" }, body: { status: "Present" } }, response);
  assert.equal(response.statusCode, 400);
  response = res();
  await controller.updateAttendance({ params: { id: fixture._id }, body: null }, response);
  assert.equal(response.statusCode, 400);
  response = res();
  await controller.updateAttendance({ params: { id: fixture._id }, body: { role: "HR" } }, response);
  assert.equal(response.statusCode, 400);
  response = res();
  await controller.updateAttendance({ params: { id: fixture._id }, body: { status: "Holiday" } }, response);
  assert.equal(response.statusCode, 400);

  response = res();
  await controller.updateAttendance({ params: { id: fixture._id }, body: { date: "2026-10-27", checkInTime: "2026-10-27T09:00:00Z", status: "Half Day" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(updates.fields.checkInTime, "2026-10-27T09:00:00.000Z");
  assert.equal(updates.options.runValidators, true);
  assert.equal(updates.options.returnDocument, "after");

  Attendance.findByIdAndUpdate = () => ({ populate: async () => null });
  response = res();
  await controller.updateAttendance({ params: { id: fixture._id }, body: { status: "Present" } }, response);
  assert.equal(response.statusCode, 404);
  Attendance.findByIdAndUpdate = () => { const error = new Error("duplicate"); error.code = 11000; throw error; };
  response = res();
  await controller.updateAttendance({ params: { id: fixture._id }, body: { status: "Present" } }, response);
  assert.equal(response.statusCode, 409);
});

test("Attendance delete handles invalid, missing, and existing records", async () => {
  let deleted;
  Attendance.findByIdAndDelete = async (recordId) => { deleted = recordId; return fixture; };
  let response = res();
  await controller.deleteAttendance({ params: { id: "bad" } }, response);
  assert.equal(response.statusCode, 400);
  response = res();
  await controller.deleteAttendance({ params: { id: fixture._id } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(deleted, fixture._id);
  Attendance.findByIdAndDelete = async () => null;
  response = res();
  await controller.deleteAttendance({ params: { id: fixture._id } }, response);
  assert.equal(response.statusCode, 404);
});
