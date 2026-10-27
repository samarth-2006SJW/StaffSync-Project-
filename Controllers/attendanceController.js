
const mongoose = require("mongoose");
const Attendance = require("../Models/Attendance");
const Employee = require("../Models/Employee");
const User = require("../Models/User");
const parseAttendanceDate = require("../utils/attendanceDate");

const VALID_STATUSES = ["Present", "Absent", "Half Day"];
const ATTENDANCE_FIELDS = ["user", "date", "checkInTime", "checkOutTime", "status"];

const parseAttendanceTime = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  if (!parseAttendanceDate(value.slice(0, 10))) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const parseOptionalAttendanceTime = (value) => {
  if (value === undefined || value === null || value === "") return { valid: true, value: null };
  const parsed = parseAttendanceTime(value);
  return parsed ? { valid: true, value: parsed } : { valid: false };
};

const isValidObjectId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

const populateUser = (query) =>
  query.populate({
    path: "user",
    select: "name email role",
    model: User,
  });

// POST /api/attendance
const createAttendance = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Request body must be a JSON object",
      });
    }

    const { user, date, checkInTime, checkOutTime, status } = req.body;

    if (Object.keys(req.body).some((field) => !ATTENDANCE_FIELDS.includes(field))) {
      return res.status(400).json({ success: false, message: "Request contains unsupported attendance fields" });
    }

    if (!user || !date) {
      return res.status(400).json({
        success: false,
        message: "user and date are required",
      });
    }

    if (!isValidObjectId(user)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const parsedDate = parseAttendanceDate(date);

    if (!parsedDate) {
      return res.status(400).json({
        success: false,
        message: "Invalid date; provide a valid calendar date or date-time",
      });
    }

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid attendance status",
      });
    }

    const parsedCheckIn = parseOptionalAttendanceTime(checkInTime);
    const parsedCheckOut = parseOptionalAttendanceTime(checkOutTime);
    if (!parsedCheckIn.valid || !parsedCheckOut.valid) {
      return res.status(400).json({ success: false, message: "checkInTime and checkOutTime must be ISO 8601 date-time strings or null" });
    }

    const existingUser = await User.findById(user);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const attendance = await Attendance.create({
      user,
      date: parsedDate,
      checkInTime: parsedCheckIn.value,
      checkOutTime: parsedCheckOut.value,
      status: status === undefined ? "Present" : status,
    });

    const result = await populateUser(
      Attendance.findById(attendance._id)
    );

    return res.status(201).json({
      success: true,
      message: "Attendance created successfully",
      data: result,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Attendance already exists for this user and date",
      });
    }

    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Create attendance error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create attendance",
    });
  }
};

// GET /api/attendance
const getAttendance = async (req, res) => {
  try {
    const { name, date } = req.query;
    const filter = {};
    const unsupportedFilters = Object.keys(req.query).filter(
      (key) => !["name", "date"].includes(key)
    );

    if (unsupportedFilters.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Only name and date filters are supported",
      });
    }

    if (name !== undefined) {
      if (typeof name !== "string") {
        return res.status(400).json({
          success: false,
          message: "Employee name must be text",
        });
      }

      const employeeName = name.trim();

      if (
        req.user.role === "Employee" &&
        employeeName &&
        employeeName.toLocaleLowerCase() !== req.user.name.toLocaleLowerCase()
      ) {
        return res.status(403).json({
          success: false,
          message: "Employees can only view their own attendance",
        });
      }

      if (req.user.role === "HR" && employeeName) {
        const escapedName = employeeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const employees = await Employee.find({
          name: { $regex: `^${escapedName}$`, $options: "i" },
        }).select("user");

        if (employees.length > 1) {
          return res.status(409).json({
            success: false,
            message: "Multiple employees match this name; use a unique name or employee profile ID",
            candidates: employees.map((employee) => ({ employee: employee._id, user: employee.user })),
          });
        }

        if (employees.length === 0) {
          return res.status(200).json({
            success: true,
            count: 0,
            data: [],
          });
        }

        filter.user = { $in: employees.map((employee) => employee.user) };
      }
    }

    if (req.user.role === "Employee") {
      filter.user = new mongoose.Types.ObjectId(req.user.id);
    }

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          success: false,
          message: "Date must use YYYY-MM-DD format",
        });
      }

      const start = new Date(`${date}T00:00:00.000Z`);

      if (
        Number.isNaN(start.getTime()) ||
        start.toISOString().slice(0, 10) !== date
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid calendar date",
        });
      }

      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);

      filter.date = { $gte: start, $lt: end };
    }

    const records = await populateUser(
      Attendance.find(filter).sort({ date: -1 })
    );

    // Date based HR views include profile rows without an attendance record. These
    // are explicitly labeled as unrecorded; the API never infers an Absent status.
    let missingAttendance = [];
    if (req.user.role === "HR" && date && name === undefined) {
      const employees = await Employee.find({}).select("name email department position user").sort({ name: 1, _id: 1 });
      const recordedUsers = new Set(records.map((record) => String(record.user?._id || record.user)));
      missingAttendance = employees
        .filter((employee) => !recordedUsers.has(String(employee.user?._id || employee.user)))
        .map((employee) => ({ employee, attendanceStatus: "Not recorded" }));
    }

    return res.status(200).json({
      success: true,
      count: records.length,
      data: records,
      ...(req.user.role === "HR" && date && name === undefined ? { missingAttendance } : {}),
    });
  } catch (error) {
    console.error("Get attendance error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance",
    });
  }
};

// PATCH /api/attendance/:id
const updateAttendance = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Request body must be a JSON object",
      });
    }

    const { id } = req.params;
    const { user, date, checkInTime, checkOutTime, status } = req.body;

    if (Object.keys(req.body).some((field) => !ATTENDANCE_FIELDS.includes(field))) {
      return res.status(400).json({ success: false, message: "Request contains unsupported attendance fields" });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid attendance ID",
      });
    }

    const updates = {};

    if (user !== undefined) {
      if (!isValidObjectId(user)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID",
        });
      }

      const existingUser = await User.findById(user);

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      updates.user = user;
    }

    if (date !== undefined) {
      const parsedDate = parseAttendanceDate(date);

      if (!parsedDate) {
        return res.status(400).json({
          success: false,
          message: "Invalid date; provide a valid calendar date or date-time",
        });
      }

      updates.date = parsedDate;
    }

    if (checkInTime !== undefined) {
      const parsed = parseOptionalAttendanceTime(checkInTime);
      if (!parsed.valid) return res.status(400).json({ success: false, message: "Invalid check-in time; provide an ISO 8601 date-time string or null" });
      updates.checkInTime = parsed.value;
    }

    if (checkOutTime !== undefined) {
      const parsed = parseOptionalAttendanceTime(checkOutTime);
      if (!parsed.valid) return res.status(400).json({ success: false, message: "Invalid check-out time; provide an ISO 8601 date-time string or null" });
      updates.checkOutTime = parsed.value;
    }

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid attendance status",
        });
      }

      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one valid field must be provided",
      });
    }

    const updated = await populateUser(
      Attendance.findByIdAndUpdate(id, updates, {
        returnDocument: "after",
        runValidators: true,
      })
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: updated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Attendance already exists for this user and date",
      });
    }

    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Update attendance error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update attendance",
    });
  }
};

// DELETE /api/attendance/:id
const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid attendance ID",
      });
    }

    const deleted = await Attendance.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Attendance deleted successfully",
      data: deleted,
    });
  } catch (error) {
    console.error("Delete attendance error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete attendance",
    });
  }
};

module.exports = {
  createAttendance,
  getAttendance,
  updateAttendance,
  deleteAttendance,
};
