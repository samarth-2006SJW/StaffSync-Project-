const Employee = require("../Models/Employee");
const User = require("../Models/User");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_FIELDS = "name email role";
const CREATE_FIELDS = [
  "user",
  "name",
  "email",
  "department",
  "position",
  "salary",
  "joinDate",
  "phone",
  "address",
];
const UPDATE_FIELDS = [
  "name",
  "email",
  "department",
  "position",
  "salary",
  "joinDate",
  "phone",
  "address",
];
const REQUIRED_TEXT_FIELDS = ["name", "department", "position"];

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasUnknownFields = (body, allowedFields) =>
  Object.keys(body).some((field) => !allowedFields.includes(field));

const isValidObjectId = (value) =>
  typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

const parseJoinDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const populateUser = (query) =>
  query.populate({ path: "user", select: USER_FIELDS, model: User });

const sendValidationError = (res, message) =>
  res.status(400).json({ success: false, message });

const handleEmployeeError = (res, error, action) => {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "An employee profile already exists for this user or email",
    });
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ success: false, message: error.message });
  }

  console.error(`${action} error:`, error.name);
  return res.status(500).json({
    success: false,
    message: `Failed to ${action.toLowerCase()} employee`,
  });
};

const validateEmployeeFields = (fields, { partial = false } = {}) => {
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (partial && fields[field] === undefined) continue;
    if (typeof fields[field] !== "string" || !fields[field].trim()) {
      return `${field} must be non-empty text`;
    }
  }

  const textLimits = { name: 120, department: 100, position: 120 };
  for (const [field, limit] of Object.entries(textLimits)) {
    if (typeof fields[field] === "string" && fields[field].trim().length > limit) {
      return `${field} must be ${limit} characters or fewer`;
    }
  }

  if ((!partial || fields.email !== undefined) &&
      (typeof fields.email !== "string" ||
       fields.email.trim().length > 254 ||
       !EMAIL_PATTERN.test(fields.email.trim()))) {
    return "email must be a valid email address";
  }

  if ((!partial || fields.salary !== undefined) &&
      (typeof fields.salary !== "number" ||
       !Number.isFinite(fields.salary) || fields.salary < 0)) {
    return "salary must be a non-negative number";
  }

  if ((!partial || fields.joinDate !== undefined) && !parseJoinDate(fields.joinDate)) {
    return "joinDate must be a real calendar date in YYYY-MM-DD format";
  }

  for (const field of ["phone", "address"]) {
    if (fields[field] !== undefined && typeof fields[field] !== "string") {
      return `${field} must be text`;
    }
  }

  if (typeof fields.phone === "string" && fields.phone.length > 40) {
    return "phone must be 40 characters or fewer";
  }
  if (typeof fields.address === "string" && fields.address.length > 500) {
    return "address must be 500 characters or fewer";
  }

  return null;
};

// GET /api/employees?name=<partial name>
const getEmployees = async (req, res) => {
  try {
    const unsupported = Object.keys(req.query || {}).filter((key) => key !== "name");
    if (unsupported.length) {
      return sendValidationError(res, "Only the name search parameter is supported");
    }

    const filter = {};
    if (req.query?.name !== undefined) {
      if (typeof req.query.name !== "string" || !req.query.name.trim()) {
        return sendValidationError(res, "name search must be non-empty text");
      }
      filter.name = {
        $regex: escapeRegex(req.query.name.trim()),
        $options: "i",
      };
    }

    const employees = await populateUser(
      Employee.find(filter).sort({ name: 1, _id: 1 })
    );

    return res.status(200).json({
      success: true,
      count: employees.length,
      employees,
    });
  } catch (error) {
    return handleEmployeeError(res, error, "fetch");
  }
};

// GET /api/employees/:id
const getEmployeeById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendValidationError(res, "Invalid employee ID");
    }

    const employee = await populateUser(Employee.findById(req.params.id));
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    return res.status(200).json({ success: true, employee });
  } catch (error) {
    return handleEmployeeError(res, error, "fetch");
  }
};

// POST /api/employees
const createEmployee = async (req, res) => {
  try {
    const body = req.body;
    if (!isPlainObject(body)) {
      return sendValidationError(res, "Request body must be a JSON object");
    }
    if (hasUnknownFields(body, CREATE_FIELDS)) {
      return sendValidationError(res, "Request contains unsupported employee fields");
    }

    const errorMessage = validateEmployeeFields(body);
    if (errorMessage) return sendValidationError(res, errorMessage);
    if (!isValidObjectId(body.user)) {
      return sendValidationError(res, "user must be a valid User ID");
    }

    const registeredUser = await User.findById(body.user).select("_id");
    if (!registeredUser) {
      return res.status(404).json({ success: false, message: "Registered user not found" });
    }

    const normalizedEmail = body.email.trim().toLowerCase();
    const existingEmployee = await Employee.findOne({
      $or: [{ user: body.user }, { email: normalizedEmail }],
    });
    if (existingEmployee) {
      return res.status(409).json({
        success: false,
        message: "An employee profile already exists for this User or email",
      });
    }

    const normalized = {
      user: body.user,
      name: body.name.trim(),
      email: normalizedEmail,
      department: body.department.trim(),
      position: body.position.trim(),
      salary: body.salary,
      joinDate: parseJoinDate(body.joinDate),
      ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
      ...(body.address !== undefined ? { address: body.address.trim() } : {}),
    };

    const employee = await Employee.create(normalized);
    await employee.populate({ path: "user", select: USER_FIELDS, model: User });

    return res.status(201).json({
      success: true,
      message: "Employee profile created successfully",
      employee,
    });
  } catch (error) {
    return handleEmployeeError(res, error, "create");
  }
};

// PATCH /api/employees/:id
const updateEmployee = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendValidationError(res, "Invalid employee ID");
    }
    const body = req.body;
    if (!isPlainObject(body)) {
      return sendValidationError(res, "Request body must be a JSON object");
    }
    if (hasUnknownFields(body, UPDATE_FIELDS)) {
      return sendValidationError(res, "Request contains unsupported or immutable employee fields");
    }
    if (Object.keys(body).length === 0) {
      return sendValidationError(res, "Provide at least one employee field to update");
    }

    const errorMessage = validateEmployeeFields(body, { partial: true });
    if (errorMessage) return sendValidationError(res, errorMessage);

    const updates = { ...body };
    for (const field of REQUIRED_TEXT_FIELDS) {
      if (updates[field] !== undefined) updates[field] = updates[field].trim();
    }
    if (updates.email !== undefined) updates.email = updates.email.trim().toLowerCase();
    if (updates.joinDate !== undefined) updates.joinDate = parseJoinDate(updates.joinDate);
    for (const field of ["phone", "address"]) {
      if (updates[field] !== undefined) updates[field] = updates[field].trim();
    }

    if (updates.email !== undefined) {
      const existingEmail = await Employee.findOne({
        email: updates.email,
        _id: { $ne: req.params.id },
      });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: "An employee profile already exists for this email",
        });
      }
    }

    const employee = await Employee.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: "after",
      runValidators: true,
      context: "query",
    });
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    await employee.populate({ path: "user", select: USER_FIELDS, model: User });

    return res.status(200).json({
      success: true,
      message: "Employee profile updated successfully",
      employee,
    });
  } catch (error) {
    return handleEmployeeError(res, error, "update");
  }
};

// DELETE /api/employees/:id (does not delete the linked User account)
const deleteEmployee = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return sendValidationError(res, "Invalid employee ID");
    }

    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    await employee.populate({ path: "user", select: USER_FIELDS, model: User });

    return res.status(200).json({
      success: true,
      message: "Employee profile deleted successfully; linked User account was kept",
      employee,
    });
  } catch (error) {
    return handleEmployeeError(res, error, "delete");
  }
};

module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
};
