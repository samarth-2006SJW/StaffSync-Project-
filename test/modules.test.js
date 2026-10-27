const test = require("node:test");
const assert = require("node:assert/strict");
const Leave = require("../Models/Leave");
const User = require("../Models/User");
const Announcement = require("../Models/Announcement");
const Training = require("../Models/Training");
const leave = require("../Controllers/leaveController");
const announcement = require("../Controllers/announcementController");
const training = require("../Controllers/trainingController");

const userId = "6adf46aa4638ce2544efbdf4";
const id = "6adf46aa4638ce2544efbdf5";
const originals = {
  userFind: User.find,
  leaveCreate: Leave.create,
  leaveFindById: Leave.findById,
  leaveFindOneAndUpdate: Leave.findOneAndUpdate,
  leaveFindOneAndDelete: Leave.findOneAndDelete,
  leaveExists: Leave.exists,
  announcementCreate: Announcement.create,
  trainingCreate: Training.create,
};
const restore = () => {
  User.find = originals.userFind;
  Leave.create = originals.leaveCreate;
  Leave.findById = originals.leaveFindById;
  Leave.findOneAndUpdate = originals.leaveFindOneAndUpdate;
  Leave.findOneAndDelete = originals.leaveFindOneAndDelete;
  Leave.exists = originals.leaveExists;
  Announcement.create = originals.announcementCreate;
  Training.create = originals.trainingCreate;
};
const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const request = (body, role = "Employee") => ({ body, params: { id }, query: {}, user: { id: userId, role } });
const pendingBody = { startDate: "2026-11-02", endDate: "2026-11-03", reason: "Travel" };

test.afterEach(restore);

test("employee leave submission binds the authenticated User and applies server defaults", async () => {
  let saved;
  Leave.create = async (fields) => { saved = fields; return fields; };
  let res = response();
  await leave.createLeave(request(pendingBody), res);
  assert.equal(res.statusCode, 201);
  assert.equal(String(saved.user), userId);
  assert.equal(saved.status, undefined);
  assert.equal(saved.startDate.toISOString(), "2026-11-02T00:00:00.000Z");
});

test("leave submission rejects owner/reviewer mass assignment and invalid dates", async () => {
  for (const body of [
    { ...pendingBody, user: userId },
    { ...pendingBody, approverRole: "HR" },
    { ...pendingBody, endDate: "2026-11-01" },
    { ...pendingBody, startDate: "2026-02-30" },
  ]) {
    const res = response();
    await leave.createLeave(request(body), res);
    assert.equal(res.statusCode, 400);
  }
});

test("HR or Manager review records only the permitted role and transitions from Pending", async () => {
  let query;
  Leave.findOneAndUpdate = (filter, update) => {
    query = { filter, update };
    const chain = { populate() { return this; }, then(resolve) { resolve({ _id: id, status: "Approved" }); } };
    return chain;
  };
  const res = response();
  await leave.reviewLeave({ params: { id }, body: { status: "Approved" }, user: { id: userId, role: "Manager" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(query.filter, { _id: id, status: "Pending" });
  assert.deepEqual(query.update.$set, { status: "Approved", approverRole: "Manager" });
});

test("reviewed leave cannot be edited or deleted by its employee", async () => {
  Leave.findById = async () => ({ user: userId, status: "Approved" });
  let res = response();
  await leave.updateLeave(request({ reason: "Changed" }), res);
  assert.equal(res.statusCode, 409);

  Leave.findOneAndDelete = async () => null;
  Leave.findById = () => ({ select: async () => ({ user: userId, status: "Approved" }) });
  res = response();
  await leave.deleteLeave(request(undefined), res);
  assert.equal(res.statusCode, 409);
});

test("announcement and training APIs reject protected fields and malformed inputs", async () => {
  const actor = { id: userId, role: "HR" };
  let res = response();
  await announcement.create({ user: actor, body: { title: "Notice", message: "Hello", createdBy: userId } }, res);
  assert.equal(res.statusCode, 400);

  res = response();
  await training.create({ user: actor, body: { title: "Course", description: "Details", date: "2026-02-30" } }, res);
  assert.equal(res.statusCode, 400);
});

test("training assignment requires existing, unique User IDs", async () => {
  User.find = () => ({ select: async () => [] });
  let res = response();
  await training.create({
    user: { id: userId, role: "HR" },
    body: { title: "Course", description: "Details", date: "2026-11-02", assignedTo: [userId] },
  }, res);
  assert.equal(res.statusCode, 404);

  res = response();
  await training.create({
    user: { id: userId, role: "HR" },
    body: { title: "Course", description: "Details", date: "2026-11-02", assignedTo: [userId, userId] },
  }, res);
  assert.equal(res.statusCode, 400);
});
