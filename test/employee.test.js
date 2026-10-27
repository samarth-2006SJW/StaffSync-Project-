const test = require("node:test");
const assert = require("node:assert/strict");
const Employee = require("../Models/Employee");
const User = require("../Models/User");
const controller = require("../Controllers/employeeController");
const { authenticate, authorizeRoles } = require("../Middleware/authMiddleware");
const routes = require("../Routes/employeeRoutes");

const original = {
  employeeFind: Employee.find,
  employeeFindOne: Employee.findOne,
  employeeFindById: Employee.findById,
  employeeCreate: Employee.create,
  employeeFindByIdAndUpdate: Employee.findByIdAndUpdate,
  employeeFindByIdAndDelete: Employee.findByIdAndDelete,
  userFindById: User.findById,
  userFindByIdAndDelete: User.findByIdAndDelete,
};

const restore = () => {
  Employee.find = original.employeeFind;
  Employee.findOne = original.employeeFindOne;
  Employee.findById = original.employeeFindById;
  Employee.create = original.employeeCreate;
  Employee.findByIdAndUpdate = original.employeeFindByIdAndUpdate;
  Employee.findByIdAndDelete = original.employeeFindByIdAndDelete;
  User.findById = original.userFindById;
  User.findByIdAndDelete = original.userFindByIdAndDelete;
};

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const linkedUser = {
  _id: "6adf46aa4638ce2544efbdf4",
  name: "Login Person",
  email: "login@example.com",
  role: "Employee",
};

const employeeFixture = (overrides = {}) => ({
  _id: "6adf63b86517594ce0672fd6",
  user: { ...linkedUser },
  name: "Alex Smith",
  email: "alex@example.com",
  department: "Engineering",
  position: "Developer",
  salary: 75000,
  joinDate: new Date("2026-01-15T00:00:00.000Z"),
  phone: "555-0100",
  address: "Example Road",
  populate: async function () { return this; },
  ...overrides,
});

const validBody = (overrides = {}) => ({
  user: linkedUser._id,
  name: "Alex Smith",
  email: "Alex@Example.com",
  department: "Engineering",
  position: "Developer",
  salary: 75000,
  joinDate: "2026-01-15",
  phone: "555-0100",
  address: "Example Road",
  ...overrides,
});

const mockUserExists = (user = linkedUser) => {
  User.findById = () => ({ select: async (fields) => {
    assert.equal(fields, "_id");
    return user;
  } });
};

test.afterEach(restore);

test("Employee model references one User, while name and email remain non-unique profile fields", () => {
  const userPath = Employee.schema.path("user");
  assert.equal(userPath.options.ref, "User");
  assert.equal(userPath.options.required, true);
  assert.equal(userPath.options.unique, true);
  assert.equal(Employee.schema.path("name").options.unique, undefined);
  assert.equal(Employee.schema.path("email").options.unique, true);
  assert.equal(User.schema.path("password").options.select, false);
});

test("create links to an existing User and only writes allowlisted normalized fields", async () => {
  mockUserExists();
  Employee.findOne = async () => null;
  let created;
  Employee.create = async (fields) => {
    created = fields;
    return employeeFixture({ ...fields, _id: "new-profile" });
  };
  const req = { body: validBody({ role: "HR", password: "nope", isAdmin: true }) };
  const res = response();
  await controller.createEmployee(req, res);

  assert.equal(res.statusCode, 400, "unknown fields must be rejected instead of mass-assigned");
  assert.equal(created, undefined);

  req.body = validBody();
  Employee.findOne = async () => null;
  await controller.createEmployee(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.user, linkedUser._id);
  assert.equal(created.email, "alex@example.com");
  assert.equal(created.joinDate.toISOString(), "2026-01-15T00:00:00.000Z");
  assert.equal("password" in created, false);
  assert.equal(res.body.employee.user.password, undefined);
});

test("create rejects invalid values, nonexistent User, and duplicate user/email links", async () => {
  const invalidBodies = [
    validBody({ user: "bad-id" }),
    validBody({ email: "not-an-email" }),
    validBody({ salary: -1 }),
    validBody({ salary: "75000" }),
    validBody({ joinDate: "2026-02-30" }),
    validBody({ unexpected: true }),
  ];
  for (const body of invalidBodies) {
    const res = response();
    await controller.createEmployee({ body }, res);
    assert.equal(res.statusCode, 400);
  }

  mockUserExists(null);
  let res = response();
  await controller.createEmployee({ body: validBody() }, res);
  assert.equal(res.statusCode, 404);

  mockUserExists();
  Employee.findOne = async () => employeeFixture();
  res = response();
  await controller.createEmployee({ body: validBody() }, res);
  assert.equal(res.statusCode, 409);

  Employee.findOne = async () => null;
  Employee.create = async () => { const error = new Error("duplicate"); error.code = 11000; throw error; };
  res = response();
  await controller.createEmployee({ body: validBody() }, res);
  assert.equal(res.statusCode, 409, "unique-index race is handled safely");
});

test("list returns all profiles and case-insensitive escaped name search keeps duplicate names distinct", async () => {
  const duplicateNames = [
    employeeFixture({ _id: "profile-1", name: "Alex Smith", email: "alex1@example.com", department: "Engineering" }),
    employeeFixture({ _id: "profile-2", name: "Alex Smith", email: "alex2@example.com", department: "Support" }),
  ];
  let usedFilter;
  let populateOptions;
  Employee.find = (filter) => ({
    sort(sortOptions) {
      assert.deepEqual(sortOptions, { name: 1, _id: 1 });
      return this;
    },
    populate: async (options) => {
      usedFilter = filter;
      populateOptions = options;
      return duplicateNames;
    },
  });

  const res = response();
  await controller.getEmployees({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 2);
  assert.equal(res.body.employees[0].email, "alex1@example.com");
  assert.equal(res.body.employees[1].department, "Support");
  assert.deepEqual(usedFilter, {});
  assert.equal(populateOptions.select, "name email role");

  await controller.getEmployees({ query: { name: "Alex.*" } }, res);
  assert.equal(usedFilter.name.$regex, "Alex\\.\\*");
  assert.equal(usedFilter.name.$options, "i");
});

test("list rejects blank names and unsupported query filters", async () => {
  let res = response();
  await controller.getEmployees({ query: { name: "   " } }, res);
  assert.equal(res.statusCode, 400);
  res = response();
  await controller.getEmployees({ query: { department: "IT" } }, res);
  assert.equal(res.statusCode, 400);
});

test("get by ID validates IDs and returns 404 for missing profiles", async () => {
  let res = response();
  await controller.getEmployeeById({ params: { id: "bad-id" } }, res);
  assert.equal(res.statusCode, 400);

  Employee.findById = () => ({ populate: async () => null });
  res = response();
  await controller.getEmployeeById({ params: { id: "6adf63b86517594ce0672fd6" } }, res);
  assert.equal(res.statusCode, 404);

  Employee.findById = () => ({ populate: async (options) => {
    assert.equal(options.select, "name email role");
    return employeeFixture();
  } });
  res = response();
  await controller.getEmployeeById({ params: { id: "6adf63b86517594ce0672fd6" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.employee.user.email, "login@example.com");
});

test("update changes only supplied allowed fields and rejects relationship/mass assignment", async () => {
  let update;
  Employee.findByIdAndUpdate = async (_id, fields, options) => {
    update = { fields, options };
    return employeeFixture({ name: fields.name || "Alex Smith" });
  };
  let res = response();
  await controller.updateEmployee({
    params: { id: "6adf63b86517594ce0672fd6" },
    body: { name: "  Alex New  ", salary: 80000 },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(update.fields, { name: "Alex New", salary: 80000 });
  assert.equal(update.options.runValidators, true);
  assert.equal(update.options.returnDocument, "after");

  for (const body of [{}, { user: "6adf46aa4638ce2544efbdf4" }, { password: "x" }, { salary: -1 }, { address: {} }]) {
    res = response();
    await controller.updateEmployee({ params: { id: "6adf63b86517594ce0672fd6" }, body }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("update handles missing and duplicate profiles", async () => {
  Employee.findByIdAndUpdate = async () => null;
  let res = response();
  await controller.updateEmployee({ params: { id: "6adf63b86517594ce0672fd6" }, body: { position: "Lead" } }, res);
  assert.equal(res.statusCode, 404);

  Employee.findOne = async () => employeeFixture();
  res = response();
  await controller.updateEmployee({ params: { id: "6adf63b86517594ce0672fd6" }, body: { email: "taken@example.com" } }, res);
  assert.equal(res.statusCode, 409);

  Employee.findOne = async () => null;
  Employee.findByIdAndUpdate = async () => { const error = new Error("duplicate"); error.code = 11000; throw error; };
  res = response();
  await controller.updateEmployee({ params: { id: "6adf63b86517594ce0672fd6" }, body: { email: "taken@example.com" } }, res);
  assert.equal(res.statusCode, 409);
});

test("delete removes only the Employee profile and leaves the linked User untouched", async () => {
  let deletedId;
  let userDeleteCalled = false;
  const originalUserDelete = User.findByIdAndDelete;
  Employee.findByIdAndDelete = async (id) => { deletedId = id; return employeeFixture(); };
  User.findByIdAndDelete = async () => { userDeleteCalled = true; };
  const res = response();
  await controller.deleteEmployee({ params: { id: "6adf63b86517594ce0672fd6" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(deletedId, "6adf63b86517594ce0672fd6");
  assert.equal(userDeleteCalled, false);
  assert.equal(res.body.employee.user._id, linkedUser._id);
  User.findByIdAndDelete = originalUserDelete;

  Employee.findByIdAndDelete = async () => null;
  const missing = response();
  await controller.deleteEmployee({ params: { id: "6adf63b86517594ce0672fd6" } }, missing);
  assert.equal(missing.statusCode, 404);
});

test("all Employee CRUD routes require authentication followed by HR authorization", () => {
  const employeePaths = routes.stack.filter((layer) => layer.route);
  assert.equal(employeePaths.length, 5);
  for (const layer of employeePaths) {
    assert.equal(layer.route.stack[0].handle, authenticate);
    assert.match(layer.route.stack[1].handle.toString(), /allowedRoles\.includes\(req\.user\.role\)/);
  }
  const auth = response();
  authorizeRoles("HR")({ user: { role: "Employee" } }, auth, () => {});
  assert.equal(auth.statusCode, 403);
  let passed = false;
  authorizeRoles("HR")({ user: { role: "HR" } }, response(), () => { passed = true; });
  assert.equal(passed, true);
});
