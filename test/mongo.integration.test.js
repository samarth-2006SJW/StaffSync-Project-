const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
require("dotenv").config({ quiet: true });
const User = require("../Models/User");
const Employee = require("../Models/Employee");
const Attendance = require("../Models/Attendance");
const Leave = require("../Models/Leave");
const Announcement = require("../Models/Announcement");
const Training = require("../Models/Training");
const { createAccessToken } = require("../utils/authToken");
const { assertSafeTestDatabase } = require("../utils/testDatabaseSafety");

const enabled = process.env.RUN_MONGO_INTEGRATION === "1";
process.env.JWT_SECRET = crypto.randomBytes(48).toString("base64url");

const indexIsPresent = (indexes, keys, unique) => indexes.some((index) =>
  JSON.stringify(index.key) === JSON.stringify(keys) && Boolean(index.unique) === unique
);

test("isolated MongoDB integration: persistence, indexes, references, CRUD, auth, and authorization", {
  skip: !enabled && "set RUN_MONGO_INTEGRATION=1 to run against an explicitly designated test database",
}, async () => {
  const testUri = process.env.TEST_MONGO_URI;
  const expectedDatabase = assertSafeTestDatabase({ testUri, appUri: process.env.MONGO_URI });
  const createdUserIds = [];
  const createdEmployeeIds = [];
  const createdAttendanceIds = [];
  const createdLeaveIds = [];
  const createdAnnouncementIds = [];
  const createdTrainingIds = [];
  let server;
  let connected = false;

  try {
    await mongoose.connect(testUri, { serverSelectionTimeoutMS: 7000 });
    connected = true;
    assert.equal(mongoose.connection.db.databaseName, expectedDatabase);
    assert.notEqual(mongoose.connection.db.databaseName, "StaffSync");

    await Promise.all([User.createIndexes(), Employee.createIndexes(), Attendance.createIndexes(), Leave.createIndexes(), Announcement.createIndexes(), Training.createIndexes()]);
    assert.equal(User.collection.collectionName, "Users");
    assert.equal(Employee.collection.collectionName, "Employees");
    assert.equal(Attendance.collection.collectionName, "Attendance");
    assert.equal(Leave.collection.collectionName, "LeaveRequests");
    assert.equal(Announcement.collection.collectionName, "Announcements");
    assert.equal(Training.collection.collectionName, "TrainingPrograms");
    assert.ok(indexIsPresent(await User.collection.indexes(), { email: 1 }, true));
    assert.ok(indexIsPresent(await Employee.collection.indexes(), { user: 1 }, true));
    assert.ok(indexIsPresent(await Employee.collection.indexes(), { email: 1 }, true));
    assert.ok(indexIsPresent(await Attendance.collection.indexes(), { user: 1, date: 1 }, true));
    assert.ok(indexIsPresent(await Leave.collection.indexes(), { user: 1, createdAt: -1 }, false));
    assert.ok(indexIsPresent(await Announcement.collection.indexes(), { createdAt: -1 }, false));
    assert.ok(indexIsPresent(await Training.collection.indexes(), { date: 1 }, false));

    const { app } = require("../server");
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const call = async (path, { method = "GET", token, body } = {}) => {
      const headers = {};
      if (token) headers.authorization = `Bearer ${token}`;
      if (body !== undefined) headers["content-type"] = "application/json";
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };

    const runId = crypto.randomUUID();
    const password = `Test-${crypto.randomBytes(18).toString("hex")}`;
    const employeeName = `Integration ${runId}`;
    const registerAndLogin = async (name, role = "Employee") => {
      const email = `${role.toLowerCase()}-${runId}-${createdUserIds.length}@example.test`;
      const registered = await call("/api/auth/register", {
        method: "POST",
        body: { name, email, password, role },
      });
      assert.equal(registered.status, 201);
      assert.equal(registered.body.user.password, undefined);
      createdUserIds.push(new mongoose.Types.ObjectId(registered.body.user.id));
      const stored = await User.findById(registered.body.user.id).select("+password");
      assert.ok(stored);
      assert.notEqual(stored.password, password);
      assert.equal(await stored.comparePassword(password), true);
      const loggedIn = await call("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      assert.equal(loggedIn.status, 200);
      assert.equal(loggedIn.body.user.password, undefined);
      return { id: registered.body.user.id, email, token: loggedIn.body.token };
    };

    const employeeA = await registerAndLogin(employeeName);
    const employeeB = await registerAndLogin(employeeName);
    const hr = await User.create({
      name: `HR ${runId}`,
      email: `hr-${runId}@example.test`,
      password,
      role: "HR",
    });
    createdUserIds.push(hr._id);
    const manager = await User.create({
      name: `Manager ${runId}`,
      email: `manager-${runId}@example.test`,
      password,
      role: "Manager",
    });
    createdUserIds.push(manager._id);
    const hrToken = createAccessToken(hr._id);
    const managerToken = createAccessToken(manager._id);

    const unauthenticatedEmployees = await call("/api/employees");
    assert.equal(unauthenticatedEmployees.status, 401);
    assert.equal((await call("/api/employees", { token: employeeA.token })).status, 403);
    assert.equal((await call("/api/employees", { token: managerToken })).status, 403);

    const employeeBody = (userId, suffix) => ({
      user: userId,
      name: employeeName,
      email: `profile-${suffix}-${runId}@example.test`,
      department: "Integration",
      position: "Test Employee",
      salary: 1,
      joinDate: "2020-01-01",
    });
    const profileAResponse = await call("/api/employees", {
      method: "POST",
      token: hrToken,
      body: employeeBody(employeeA.id, "a"),
    });
    assert.equal(profileAResponse.status, 201);
    createdEmployeeIds.push(new mongoose.Types.ObjectId(profileAResponse.body.employee._id));
    const profileBResponse = await call("/api/employees", {
      method: "POST",
      token: hrToken,
      body: employeeBody(employeeB.id, "b"),
    });
    assert.equal(profileBResponse.status, 201);
    createdEmployeeIds.push(new mongoose.Types.ObjectId(profileBResponse.body.employee._id));

    assert.equal((await call("/api/employees", {
      method: "POST",
      token: hrToken,
      body: employeeBody(employeeA.id, "duplicate"),
    })).status, 409);
    const absentUserId = new mongoose.Types.ObjectId().toString();
    assert.equal((await call("/api/employees", {
      method: "POST",
      token: hrToken,
      body: employeeBody(absentUserId, "missing"),
    })).status, 404);
    const listedProfiles = await call(`/api/employees?name=${encodeURIComponent(employeeName)}`, { token: hrToken });
    assert.equal(listedProfiles.status, 200);
    assert.equal(listedProfiles.body.count, 2);
    assert.equal((await call(`/api/employees/${profileAResponse.body.employee._id}`, { token: hrToken })).status, 200);

    const submittedLeave = await call("/api/leaves", {
      method: "POST",
      token: employeeA.token,
      body: { startDate: "2026-11-02", endDate: "2026-11-03", reason: `Integration ${runId}` },
    });
    assert.equal(submittedLeave.status, 201);
    createdLeaveIds.push(new mongoose.Types.ObjectId(submittedLeave.body.leave._id));
    assert.equal(submittedLeave.body.leave.status, "Pending");
    assert.equal((await call("/api/leaves", { token: employeeB.token })).body.count, 0);
    assert.equal((await call(`/api/leaves/${submittedLeave.body.leave._id}/status`, {
      method: "PATCH", token: employeeA.token, body: { status: "Approved" },
    })).status, 403);
    const reviewedLeave = await call(`/api/leaves/${submittedLeave.body.leave._id}/status`, {
      method: "PATCH", token: managerToken, body: { status: "Approved" },
    });
    assert.equal(reviewedLeave.status, 200);
    assert.equal(reviewedLeave.body.leave.approverRole, "Manager");
    assert.equal((await call(`/api/leaves/${submittedLeave.body.leave._id}`, {
      method: "DELETE", token: employeeA.token,
    })).status, 409);

    const pendingForEdit = await call("/api/leaves", {
      method: "POST", token: employeeB.token,
      body: { startDate: "2026-12-10", endDate: "2026-12-11", reason: `Edit ${runId}` },
    });
    assert.equal(pendingForEdit.status, 201);
    createdLeaveIds.push(new mongoose.Types.ObjectId(pendingForEdit.body.leave._id));
    const changedLeave = await call(`/api/leaves/${pendingForEdit.body.leave._id}`, {
      method: "PATCH", token: employeeB.token, body: { reason: `Updated ${runId}` },
    });
    assert.equal(changedLeave.status, 200);
    assert.equal(changedLeave.body.leave.reason, `Updated ${runId}`);
    assert.equal((await call(`/api/leaves/${pendingForEdit.body.leave._id}`, {
      method: "DELETE", token: employeeB.token,
    })).status, 200);

    const createdAnnouncement = await call("/api/announcements", {
      method: "POST", token: hrToken, body: { title: `Notice ${runId}`, message: "Integration notice" },
    });
    assert.equal(createdAnnouncement.status, 201);
    createdAnnouncementIds.push(new mongoose.Types.ObjectId(createdAnnouncement.body.announcement._id));
    assert.equal((await call(`/api/announcements/${createdAnnouncement.body.announcement._id}`, { token: employeeA.token })).status, 200);
    const changedAnnouncement = await call(`/api/announcements/${createdAnnouncement.body.announcement._id}`, {
      method: "PATCH", token: hrToken, body: { message: "Updated integration notice" },
    });
    assert.equal(changedAnnouncement.status, 200);
    assert.equal(changedAnnouncement.body.announcement.message, "Updated integration notice");
    assert.equal((await Announcement.findById(createdAnnouncement.body.announcement._id)).message, "Updated integration notice");
    assert.equal((await call(`/api/announcements/${createdAnnouncement.body.announcement._id}`, { method: "DELETE", token: hrToken })).status, 200);
    const createdTraining = await call("/api/trainings", {
      method: "POST", token: hrToken,
      body: { title: `Course ${runId}`, description: "Integration course", date: "2026-11-02", trainer: "TBD", assignedTo: [employeeA.id] },
    });
    assert.equal(createdTraining.status, 201);
    createdTrainingIds.push(new mongoose.Types.ObjectId(createdTraining.body.training._id));
    assert.equal((await call(`/api/trainings/${createdTraining.body.training._id}`, { token: employeeA.token })).status, 200);
    assert.equal((await call(`/api/trainings/${createdTraining.body.training._id}`, { token: employeeB.token })).status, 403);
    assert.equal((await call(`/api/trainings/${createdTraining.body.training._id}`, { method: "DELETE", token: employeeA.token })).status, 403);
    const changedTraining = await call(`/api/trainings/${createdTraining.body.training._id}`, {
      method: "PATCH", token: hrToken, body: { trainer: "Updated Trainer", assignedTo: [employeeB.id] },
    });
    assert.equal(changedTraining.status, 200);
    assert.equal(changedTraining.body.training.trainer, "Updated Trainer");
    assert.equal((await Training.findById(createdTraining.body.training._id)).assignedTo[0].toString(), employeeB.id);
    assert.equal((await call(`/api/trainings/${createdTraining.body.training._id}`, { token: employeeA.token })).status, 403);
    assert.equal((await call(`/api/trainings/${createdTraining.body.training._id}`, { method: "DELETE", token: hrToken })).status, 200);

    const duplicateEmail = await User.create({
      name: `Duplicate ${runId}`,
      email: employeeA.email,
      password,
    }).then(() => null, (error) => error);
    assert.equal(duplicateEmail?.code, 11000);
    const duplicateUserLink = await Employee.create({
      ...employeeBody(employeeA.id, "unique-check"),
      email: `unique-check-${runId}@example.test`,
    }).then(() => null, (error) => error);
    assert.equal(duplicateUserLink?.code, 11000);

    const day = new Date().toISOString().slice(0, 10);
    const createdRecord = async (userId) => {
      const result = await call("/api/attendance", {
        method: "POST",
        token: hrToken,
        body: { user: userId, date: day },
      });
      assert.equal(result.status, 201);
      createdAttendanceIds.push(new mongoose.Types.ObjectId(result.body.data._id));
      return result.body.data;
    };
    const attendanceA = await createdRecord(employeeA.id);
    const attendanceB = await createdRecord(employeeB.id);
    assert.equal(attendanceA.status, "Present");
    assert.equal(attendanceA.checkInTime, null);
    assert.equal(attendanceA.checkOutTime, null);
    assert.equal((await call("/api/attendance", {
      method: "POST",
      token: hrToken,
      body: { user: employeeA.id, date: day },
    })).status, 409);
    assert.equal((await call("/api/attendance", {
      method: "POST",
      token: hrToken,
      body: { user: absentUserId, date: day },
    })).status, 404);
    assert.equal((await call("/api/attendance", {
      method: "POST",
      token: hrToken,
      body: { user: employeeA.id, date: day, status: "Holiday" },
    })).status, 400);

    const ownAttendance = await call(`/api/attendance?date=${day}`, { token: employeeA.token });
    assert.equal(ownAttendance.status, 200);
    assert.equal(ownAttendance.body.count, 1);
    assert.equal(String(ownAttendance.body.data[0].user._id), employeeA.id);
    assert.equal((await call(`/api/attendance?date=${day}&name=${encodeURIComponent(employeeName)}`, {
      token: employeeA.token,
    })).status, 403);
    assert.equal((await call(`/api/attendance?date=${day}`, { token: managerToken })).status, 403);
    assert.equal((await call(`/api/attendance/${attendanceA._id}`, {
      method: "DELETE",
      token: employeeA.token,
    })).status, 403);

    const ambiguousName = await call(`/api/attendance?date=${day}&name=${encodeURIComponent(employeeName)}`, { token: hrToken });
    assert.equal(ambiguousName.status, 409);
    assert.equal(ambiguousName.body.candidates.length, 2);
    const hrAttendance = await call(`/api/attendance?date=${day}`, { token: hrToken });
    assert.equal(hrAttendance.status, 200);
    assert.ok(hrAttendance.body.data.some((record) => String(record._id) === String(attendanceA._id)));
    assert.ok(hrAttendance.body.data.some((record) => String(record._id) === String(attendanceB._id)));
    const missingUserIds = (hrAttendance.body.missingAttendance || []).map((entry) => String(entry.employee.user));
    assert.equal(missingUserIds.includes(employeeA.id), false);
    assert.equal(missingUserIds.includes(employeeB.id), false);

    const patchedAttendance = await call(`/api/attendance/${attendanceA._id}`, {
      method: "PATCH",
      token: hrToken,
      body: { checkOutTime: `${day}T17:00:00.000Z`, status: "Half Day" },
    });
    assert.equal(patchedAttendance.status, 200);
    assert.equal(patchedAttendance.body.data.status, "Half Day");
    assert.ok(patchedAttendance.body.data.checkOutTime);
    assert.equal(typeof patchedAttendance.body.data.checkOutTime, "string");
    assert.equal(patchedAttendance.body.data.checkOutTime, `${day}T17:00:00.000Z`);

    const patchedProfile = await call(`/api/employees/${profileAResponse.body.employee._id}`, {
      method: "PATCH",
      token: hrToken,
      body: { position: "Updated Integration Role" },
    });
    assert.equal(patchedProfile.status, 200);
    const persisted = await Employee.findById(profileAResponse.body.employee._id).populate("user", "name email role");
    assert.equal(persisted.position, "Updated Integration Role");
    assert.equal(String(persisted.user._id), employeeA.id);
    assert.ok(await User.exists({ _id: persisted.user._id }));
    assert.ok(await Attendance.findById(attendanceA._id).populate("user", "name email role"));

    assert.equal((await call(`/api/attendance/${attendanceA._id}`, {
      method: "DELETE",
      token: hrToken,
    })).status, 200);
    assert.equal((await call(`/api/attendance/${attendanceB._id}`, {
      method: "DELETE",
      token: hrToken,
    })).status, 200);
    assert.equal((await call(`/api/employees/${profileAResponse.body.employee._id}`, {
      method: "DELETE",
      token: hrToken,
    })).status, 200);
    assert.ok(await User.exists({ _id: employeeA.id }), "deleting a profile preserves its login User");
  } finally {
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (connected) {
      // Each cleanup is restricted to IDs inserted by this run; never clear a collection.
      if (createdAttendanceIds.length) await Attendance.deleteMany({ _id: { $in: createdAttendanceIds } });
      if (createdLeaveIds.length) await Leave.deleteMany({ _id: { $in: createdLeaveIds } });
      if (createdAnnouncementIds.length) await Announcement.deleteMany({ _id: { $in: createdAnnouncementIds } });
      if (createdTrainingIds.length) await Training.deleteMany({ _id: { $in: createdTrainingIds } });
      if (createdEmployeeIds.length) await Employee.deleteMany({ _id: { $in: createdEmployeeIds } });
      if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
      await mongoose.disconnect();
    }
  }
});
