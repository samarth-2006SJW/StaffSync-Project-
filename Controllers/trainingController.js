const mongoose = require("mongoose");
const Training = require("../Models/Training");
const User = require("../Models/User");

const EDITABLE = ["title", "description", "date", "trainer", "assignedTo"];
const validId = (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const parseDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};
const invalid = (res, message) => res.status(400).json({ success: false, message });
const failure = (res, error, action) => {
  if (["ValidationError", "CastError"].includes(error.name)) return invalid(res, error.message);
  console.error(`${action} training error:`, error.name);
  return res.status(500).json({ success: false, message: `Failed to ${action} training program` });
};

const validateBody = (body, partial = false) => {
  if (!isObject(body) || !Object.keys(body).length) return "Request body must be a non-empty JSON object";
  if (Object.keys(body).some((key) => !EDITABLE.includes(key))) return "Request contains unsupported or protected fields";
  const value = {};
  for (const field of ["title", "description"]) {
    if (body[field] === undefined && partial) continue;
    if (typeof body[field] !== "string" || !body[field].trim()) return `${field} is required`;
    value[field] = body[field].trim();
  }
  if (body.date !== undefined || !partial) {
    value.date = parseDate(body.date);
    if (!value.date) return "date must be a valid YYYY-MM-DD date";
  }
  if (body.trainer !== undefined) {
    if (typeof body.trainer !== "string" || !body.trainer.trim()) return "trainer must be non-empty text";
    value.trainer = body.trainer.trim();
  }
  if (body.assignedTo !== undefined) {
    if (!Array.isArray(body.assignedTo) || body.assignedTo.some((id) => !validId(id))) return "assignedTo must be an array of valid User IDs";
    const ids = body.assignedTo.map((id) => id.toLowerCase());
    if (new Set(ids).size !== ids.length) return "assignedTo cannot contain duplicate User IDs";
    value.assignedTo = ids;
  }
  return value;
};

const validateUsers = async (ids) => {
  if (ids === undefined) return true;
  const found = await User.find({ _id: { $in: ids } }).select("_id");
  return found.length === ids.length;
};

const populate = (query) => query.populate("createdBy", "name email role").populate("assignedTo", "name email role");

const listTraining = async (req, res) => {
  try {
    const filter = req.user.role === "Employee" ? { assignedTo: req.user.id } : {};
    const records = await populate(Training.find(filter).sort({ date: 1, _id: 1 }));
    return res.status(200).json({ success: true, count: records.length, trainings: records });
  } catch (error) { return failure(res, error, "list"); }
};

const getTraining = async (req, res) => {
  try {
    if (!validId(req.params.id)) return invalid(res, "Invalid training ID");
    const record = await populate(Training.findById(req.params.id));
    if (!record) return res.status(404).json({ success: false, message: "Training program not found" });
    if (req.user.role === "Employee" && !record.assignedTo.some((user) => String(user._id || user) === req.user.id)) return res.status(403).json({ success: false, message: "Training program is not assigned to you" });
    return res.status(200).json({ success: true, training: record });
  } catch (error) { return failure(res, error, "fetch"); }
};

const createTraining = async (req, res) => {
  try {
    const value = validateBody(req.body);
    if (typeof value === "string") return invalid(res, value);
    value.createdBy = new mongoose.Types.ObjectId(req.user.id);
    if (value.assignedTo && !(await validateUsers(value.assignedTo))) return res.status(404).json({ success: false, message: "One or more assigned User accounts were not found" });
    const record = await Training.create(value);
    await record.populate("createdBy", "name email role");
    await record.populate("assignedTo", "name email role");
    return res.status(201).json({ success: true, message: "Training program created", training: record });
  } catch (error) { return failure(res, error, "create"); }
};

const updateTraining = async (req, res) => {
  try {
    if (!validId(req.params.id)) return invalid(res, "Invalid training ID");
    const value = validateBody(req.body, true);
    if (typeof value === "string") return invalid(res, value);
    const current = await Training.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: "Training program not found" });
    if (value.assignedTo && !(await validateUsers(value.assignedTo))) return res.status(404).json({ success: false, message: "One or more assigned User accounts were not found" });
    const record = await populate(Training.findByIdAndUpdate(req.params.id, value, { new: true, runValidators: true }));
    return res.status(200).json({ success: true, message: "Training program updated", training: record });
  } catch (error) { return failure(res, error, "update"); }
};

const deleteTraining = async (req, res) => {
  try {
    if (!validId(req.params.id)) return invalid(res, "Invalid training ID");
    const record = await populate(Training.findByIdAndDelete(req.params.id));
    if (!record) return res.status(404).json({ success: false, message: "Training program not found" });
    return res.status(200).json({ success: true, message: "Training program deleted", training: record });
  } catch (error) { return failure(res, error, "delete"); }
};

module.exports = { list: listTraining, get: getTraining, create: createTraining, update: updateTraining, remove: deleteTraining };
