const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../Models/User");
const Employee = require("../Models/Employee");
const Attendance = require("../Models/Attendance");
const Leave = require("../Models/Leave");
const Announcement = require("../Models/Announcement");
const Training = require("../Models/Training");

test("all model names resolve to the required explicit collection names", () => {
  assert.deepEqual({
    User: User.collection.collectionName,
    Employee: Employee.collection.collectionName,
    Attendance: Attendance.collection.collectionName,
    Leave: Leave.collection.collectionName,
    Announcement: Announcement.collection.collectionName,
    Training: Training.collection.collectionName,
  }, {
    User: "Users",
    Employee: "Employees",
    Attendance: "Attendance",
    Leave: "LeaveRequests",
    Announcement: "Announcements",
    Training: "TrainingPrograms",
  });
});

test("confirmed User schema enforces required fields, email, role, password secrecy, and timestamps", async () => {
  assert.equal(User.schema.options.timestamps, true);
  assert.equal(User.schema.path("name").isRequired, true);
  assert.equal(User.schema.path("email").isRequired, true);
  assert.equal(User.schema.path("password").isRequired, true);
  assert.equal(User.schema.path("password").options.select, false);
  assert.equal(User.schema.path("role").options.default, "Employee");
  assert.deepEqual(User.schema.path("role").enumValues, ["HR", "Employee", "Manager"]);
  assert.equal(User.schema.path("email").options.lowercase, true);
  assert.equal(User.schema.path("email").options.trim, true);
  assert.ok(User.schema.indexes().some(([keys, options]) => keys.email === 1 && options.unique));

  const missing = new User({});
  await assert.rejects(missing.validate(), (error) => {
    assert.deepEqual(Object.keys(error.errors).sort(), ["email", "name", "password"]);
    return true;
  });
  const invalid = new User({ name: "A", email: "bad", password: "x", role: "Owner" });
  await assert.rejects(invalid.validate(), (error) => Boolean(error.errors.email && error.errors.role));
});

test("confirmed Employee schema preserves User cardinality and validates profile data", async () => {
  assert.equal(Employee.schema.options.timestamps, true);
  assert.equal(Employee.schema.path("user").options.ref, "User");
  assert.equal(Employee.schema.path("user").isRequired, true);
  assert.equal(Employee.schema.path("user").options.unique, true);
  assert.equal(Employee.schema.path("email").options.unique, true);
  for (const key of ["name", "email", "department", "position", "salary", "joinDate"]) {
    assert.equal(Employee.schema.path(key).isRequired, true, `${key} required`);
  }
  assert.ok(Employee.schema.indexes().some(([keys, options]) => keys.user === 1 && options.unique));
  assert.ok(Employee.schema.indexes().some(([keys, options]) => keys.email === 1 && options.unique));

  const invalid = new Employee({ name: "", email: "bad", department: "", position: "", salary: -1, joinDate: "not-a-date" });
  const errors = await invalid.validate().catch((error) => error.errors);
  for (const key of ["user", "name", "email", "department", "position", "salary", "joinDate"]) assert.ok(errors[key], `${key} should fail`);
});

test("confirmed Attendance schema enforces references, date/status rules, timestamps, and unique user-day index", async () => {
  assert.equal(Attendance.schema.options.timestamps, true);
  assert.equal(Attendance.schema.path("user").options.ref, "User");
  assert.equal(Attendance.schema.path("user").isRequired, true);
  assert.equal(Attendance.schema.path("date").instance, "Date");
  assert.equal(Attendance.schema.path("date").isRequired, true);
  assert.equal(Attendance.schema.path("checkInTime").instance, "String");
  assert.equal(Attendance.schema.path("checkOutTime").instance, "String");
  assert.deepEqual(Attendance.schema.path("status").enumValues, ["Present", "Absent", "Half Day"]);
  assert.equal(Attendance.schema.path("status").options.default, "Present");
  assert.equal(Attendance.schema.path("checkInTime").options.default, null);
  assert.equal(Attendance.schema.path("checkOutTime").options.default, null);
  assert.ok(Attendance.schema.indexes().some(([keys, options]) => keys.user === 1 && keys.date === 1 && options.unique));

  const invalid = new Attendance({ user: "broken", date: "not-a-date", status: "Holiday" });
  const errors = await invalid.validate().catch((error) => error.errors);
  assert.ok(errors.user);
  assert.ok(errors.date);
  assert.ok(errors.status);
});

test("Leave schema validates User relationship, reviewer role, date range, and creation date", async () => {
  assert.equal(Leave.schema.options.collection, "LeaveRequests");
  assert.equal(Leave.schema.path("user").options.ref, "User");
  assert.equal(Leave.schema.path("user").isRequired, true);
  assert.deepEqual(Leave.schema.path("approverRole").enumValues, ["HR", "Manager"]);
  assert.equal(typeof Leave.schema.path("createdAt").options.default, "function");
  assert.equal(Leave.schema.path("status").options.default, "Pending");
  assert.deepEqual(Leave.schema.path("status").enumValues, ["Pending", "Approved", "Rejected"]);
  assert.ok(Leave.schema.indexes().some(([keys]) => keys.user === 1 && keys.createdAt === -1));
  const invalid = new Leave({ startDate: "2026-04-10", endDate: "2026-04-09", reason: "Travel" });
  const errors = await invalid.validate().catch((error) => error.errors);
  assert.ok(errors.user && errors.endDate);
  const valid = new Leave({ user: "6adf46aa4638ce2544efbdf4", startDate: "2026-04-09", endDate: "2026-04-10", reason: "Travel" });
  await valid.validate();
});

test("Announcement and Training schemas use explicit collections and validate authored content", async () => {
  assert.equal(Announcement.collection.collectionName, "Announcements");
  assert.equal(Announcement.schema.path("createdBy").options.ref, "User");
  assert.equal(Announcement.schema.path("message").options.required[0], true);
  assert.equal(Training.schema.options.timestamps, true);
  assert.equal(Training.schema.path("createdBy").options.ref, "User");
  assert.equal(Training.schema.path("trainer").options.default, "TBD");
  assert.equal(Training.schema.path("assignedTo").options.type[0].ref, "User");
  const invalidAnnouncement = new Announcement({ message: "No title", createdBy: "6adf46aa4638ce2544efbdf4" });
  const announcementErrors = await invalidAnnouncement.validate().catch((error) => error.errors);
  assert.ok(announcementErrors.title);
  const invalidTraining = new Training({ title: "Course", description: "Details", createdBy: "6adf46aa4638ce2544efbdf4" });
  const trainingErrors = await invalidTraining.validate().catch((error) => error.errors);
  assert.ok(trainingErrors.date);
});

test("Mongoose does not register duplicate model names", () => {
  for (const name of ["User", "Employee", "Attendance", "Leave", "Announcement", "Training"]) {
    assert.equal(mongoose.model(name), { User, Employee, Attendance, Leave, Announcement, Training }[name]);
  }
});
