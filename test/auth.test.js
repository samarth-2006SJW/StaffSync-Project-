const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../Models/User");
const { register, login } = require("../Controllers/authController");
const { authenticate, authorizeRoles } = require("../Middleware/authMiddleware");
const authRoutes = require("../Routes/authRoutes");
const employeeRoutes = require("../Routes/employeeRoutes");
const attendanceRoutes = require("../Routes/attendanceRoutes");

process.env.JWT_SECRET = crypto.randomBytes(48).toString("base64url");

const original = { findOne: User.findOne, create: User.create, findById: User.findById };
const restore = () => Object.assign(User, original);
const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const userFixture = (overrides = {}) => ({
  _id: "6adf46aa4638ce2544efbdf4",
  name: "Test User",
  email: "test@example.com",
  role: "Employee",
  department: "IT",
  password: "stored-hash",
  comparePassword: async (password) => password === "CorrectPass123",
  ...overrides,
});
test.afterEach(restore);

test("registration validates fields and rejects bad email/password sizes", async () => {
  for (const body of [
    {},
    { name: "Test", email: "not-email", password: "CorrectPass123" },
    { name: "Test", email: "a@example.com", password: "short" },
    { name: "Test", email: "a@example.com", password: "😀".repeat(19) },
  ]) {
    const res = response();
    await register({ body }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("registration normalizes email, ignores requested role, and never returns hash", async () => {
  let created;
  User.findOne = async () => null;
  User.create = async (data) => { created = data; return userFixture({ ...data, _id: "new-id", role: "Employee" }); };
  const res = response();
  await register({ body: { name: " Test User ", email: " TEST@Example.com ", password: "CorrectPass123", role: "HR", department: "IT" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.email, "test@example.com");
  assert.equal(created.role, undefined);
  assert.equal(res.body.user.role, "Employee");
  assert.equal("password" in res.body.user, false);
  assert.equal("token" in res.body, false);
});

test("registration blocks duplicate email and handles unique-index race", async () => {
  User.findOne = async () => userFixture();
  let res = response();
  await register({ body: { name: "Test", email: "test@example.com", password: "CorrectPass123" } }, res);
  assert.equal(res.statusCode, 409);

  User.findOne = async () => null;
  User.create = async () => { const error = new Error("duplicate"); error.code = 11000; throw error; };
  res = response();
  await register({ body: { name: "Test", email: "test@example.com", password: "CorrectPass123" } }, res);
  assert.equal(res.statusCode, 409);
});

test("User schema has unique normalized email and excludes password by default", () => {
  const email = User.schema.path("email");
  assert.equal(email.options.unique, true);
  assert.equal(email.options.lowercase, true);
  assert.equal(email.options.trim, true);
  assert.equal(User.schema.path("password").options.select, false);
});

test("User save hook hashes passwords before storage", async () => {
  const user = new User({ name: "Test", email: "hash@example.com", password: "CorrectPass123" });
  const passwordHook = User.schema.s.hooks._pres.get("save").find(({ fn }) => fn.toString().includes("genSalt"));
  assert.ok(passwordHook, "password hashing save hook exists");
  await passwordHook.fn.call(user);
  assert.notEqual(user.password, "CorrectPass123");
  assert.equal(await bcrypt.compare("CorrectPass123", user.password), true);
});

test("login returns signed token and public user; bad credentials stay generic", async () => {
  const fixture = userFixture();
  User.findOne = () => ({ select: async () => fixture });
  let res = response();
  await login({ body: { email: " TEST@example.com ", password: "CorrectPass123" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).sub, fixture._id);
  assert.equal("password" in res.body.user, false);

  fixture.comparePassword = async () => false;
  res = response();
  await login({ body: { email: "test@example.com", password: "WrongPass123" } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, "Invalid email or password");

  User.findOne = () => ({ select: async () => null });
  res = response();
  await login({ body: { email: "missing@example.com", password: "WrongPass123" } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, "Invalid email or password");
});

test("authentication rejects missing, malformed, invalid, expired, and deleted-user tokens", async () => {
  const secret = process.env.JWT_SECRET;
  for (const token of [undefined, "bad-token", jwt.sign({ sub: "x" }, secret, { expiresIn: "-1s" })]) {
    const res = response();
    let nextCalled = false;
    await authenticate({ get: () => token ? `Bearer ${token}` : undefined }, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  }
  User.findById = () => ({ select: async () => null });
  const valid = jwt.sign({ sub: "6adf46aa4638ce2544efbdf4" }, secret, { expiresIn: "1h" });
  const res = response();
  await authenticate({ get: () => `Bearer ${valid}` }, res, () => {});
  assert.equal(res.statusCode, 401);
});

test("authentication attaches only safe user fields; role checks distinguish 401 and 403", async () => {
  const fixture = userFixture();
  User.findById = () => ({ select: async () => fixture });
  const token = jwt.sign({ sub: fixture._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const req = { get: () => `Bearer ${token}` };
  const res = response();
  let nextCalled = false;
  await authenticate(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.deepEqual(Object.keys(req.user).sort(), ["department", "email", "id", "name", "role"]);

  const unauthorized = response();
  authorizeRoles("HR")({}, unauthorized, () => {});
  assert.equal(unauthorized.statusCode, 401);
  const forbidden = response();
  authorizeRoles("HR")({ user: req.user }, forbidden, () => {});
  assert.equal(forbidden.statusCode, 403);
  let allowed = false;
  authorizeRoles("Employee")({ user: req.user }, response(), () => { allowed = true; });
  assert.equal(allowed, true);
});

test("protected employee and attendance routes run authentication before role checks", () => {
  for (const router of [employeeRoutes, attendanceRoutes]) {
    const protectedRoutes = router.stack.filter((layer) => layer.route);
    assert.ok(protectedRoutes.length > 0);
    for (const layer of protectedRoutes) {
      assert.equal(layer.route.stack[0].handle, authenticate);
      assert.equal(layer.route.stack[1].name, "<anonymous>");
    }
  }
  for (const layer of authRoutes.stack.filter((item) => item.route)) {
    assert.equal(layer.route.stack.some((handler) => handler.handle === authenticate), false);
  }
});
