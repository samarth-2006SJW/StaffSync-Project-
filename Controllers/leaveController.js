const mongoose = require("mongoose");
const Leave = require("../Models/Leave");

const EDIT_FIELDS = ["startDate", "endDate", "reason"];
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const validId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

const dayDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};
const bodyError = (res, message) => res.status(400).json({ success: false, message });
const fail = (res, error, action) => {
  if (error.code === 11000) return res.status(409).json({ success: false, message: "Duplicate leave request" });
  if (["ValidationError", "CastError"].includes(error.name)) return bodyError(res, error.message);
  console.error(`${action} leave error:`, error.name);
  return res.status(500).json({ success: false, message: `Failed to ${action} leave request` });
};

const createLeave = async (req, res) => {
  try {
    const body = req.body;
    if (!isObject(body)) return bodyError(res, "Request body must be a JSON object");
    if (Object.keys(body).some((key) => !["startDate", "endDate", "reason"].includes(key))) return bodyError(res, "Only startDate, endDate, and reason may be submitted");
    const startDate = dayDate(body.startDate);
    const endDate = dayDate(body.endDate);
    if (!startDate || !endDate) return bodyError(res, "startDate and endDate must be valid YYYY-MM-DD dates");
    if (endDate < startDate) return bodyError(res, "endDate must be on or after startDate");
    if (typeof body.reason !== "string" || !body.reason.trim()) return bodyError(res, "reason is required");
    const leave = await Leave.create({ user: new mongoose.Types.ObjectId(req.user.id), startDate, endDate, reason: body.reason.trim() });
    return res.status(201).json({ success: true, message: "Leave request submitted", leave });
  } catch (error) { return fail(res, error, "create"); }
};

const listLeaves = async (req, res) => {
  try {
    const reviewer = ["HR", "Manager"].includes(req.user.role);
    const allowed = reviewer ? ["status", "user"] : ["status"];
    if (Object.keys(req.query || {}).some((key) => !allowed.includes(key))) return bodyError(res, "Unsupported leave filter");
    const filter = reviewer ? {} : { user: req.user.id };
    if (req.query.status !== undefined) {
      if (!["Pending", "Approved", "Rejected"].includes(req.query.status)) return bodyError(res, "Invalid leave status filter");
      filter.status = req.query.status;
    }
    if (reviewer && req.query.user !== undefined) {
      if (!validId(req.query.user)) return bodyError(res, "Invalid user ID");
      filter.user = req.query.user;
    }
    const leaves = await Leave.find(filter).populate("user", "name email role").sort({ createdAt: -1, _id: -1 });
    return res.status(200).json({ success: true, count: leaves.length, leaves });
  } catch (error) { return fail(res, error, "list"); }
};

const getLeave = async (req, res) => {
  try {
    if (!validId(req.params.id)) return bodyError(res, "Invalid leave request ID");
    const leave = await Leave.findById(req.params.id).populate("user", "name email role");
    if (!leave) return res.status(404).json({ success: false, message: "Leave request not found" });
    if (!["HR", "Manager"].includes(req.user.role) && String(leave.user?._id || leave.user) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "You may only view your own leave requests" });
    }
    return res.status(200).json({ success: true, leave });
  } catch (error) { return fail(res, error, "fetch"); }
};

const updateLeave = async (req, res) => {
  try {
    if (!validId(req.params.id)) return bodyError(res, "Invalid leave request ID");
    if (!isObject(req.body) || !Object.keys(req.body).length) return bodyError(res, "Provide leave fields to update");
    if (Object.keys(req.body).some((key) => !EDIT_FIELDS.includes(key))) return bodyError(res, "Only startDate, endDate, and reason may be changed");
    const current = await Leave.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: "Leave request not found" });
    if (String(current.user) !== String(req.user.id)) return res.status(403).json({ success: false, message: "You may only update your own leave requests" });
    if (current.status !== "Pending") return res.status(409).json({ success: false, message: "Reviewed leave requests cannot be edited" });
    const updates = { ...req.body };
    for (const field of ["startDate", "endDate"]) {
      if (updates[field] !== undefined) {
        updates[field] = dayDate(updates[field]);
        if (!updates[field]) return bodyError(res, `${field} must be a valid YYYY-MM-DD date`);
      }
    }
    if (updates.reason !== undefined && (typeof updates.reason !== "string" || !updates.reason.trim())) return bodyError(res, "reason must be non-empty text");
    if (updates.reason !== undefined) updates.reason = updates.reason.trim();
    if ((updates.endDate || current.endDate) < (updates.startDate || current.startDate)) return bodyError(res, "endDate must be on or after startDate");
    const updated = await Leave.findOneAndUpdate({ _id: current._id, status: "Pending", user: req.user.id }, updates, { new: true, runValidators: true }).populate("user", "name email role");
    if (!updated) return res.status(409).json({ success: false, message: "Leave request changed while being updated" });
    return res.status(200).json({ success: true, message: "Leave request updated", leave: updated });
  } catch (error) { return fail(res, error, "update"); }
};

const reviewLeave = async (req, res) => {
  try {
    if (!validId(req.params.id)) return bodyError(res, "Invalid leave request ID");
    if (!isObject(req.body) || Object.keys(req.body).length !== 1 || !["Approved", "Rejected"].includes(req.body.status)) return bodyError(res, "status must be Approved or Rejected");
    const leave = await Leave.findOneAndUpdate(
      { _id: req.params.id, status: "Pending" },
      { $set: { status: req.body.status, approverRole: req.user.role } },
      { new: true, runValidators: true }
    ).populate("user", "name email role");
    if (!leave) {
      const exists = await Leave.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({ success: false, message: exists ? "Leave request has already been reviewed" : "Leave request not found" });
    }
    return res.status(200).json({ success: true, message: `Leave request ${req.body.status.toLowerCase()}`, leave });
  } catch (error) { return fail(res, error, "review"); }
};

const deleteLeave = async (req, res) => {
  try {
    if (!validId(req.params.id)) return bodyError(res, "Invalid leave request ID");
    const leave = await Leave.findOneAndDelete({ _id: req.params.id, user: req.user.id, status: "Pending" });
    if (leave) return res.status(200).json({ success: true, message: "Pending leave request deleted", leave });
    const existing = await Leave.findById(req.params.id).select("user status");
    if (!existing) return res.status(404).json({ success: false, message: "Leave request not found" });
    if (String(existing.user) !== String(req.user.id)) return res.status(403).json({ success: false, message: "You may only delete your own leave requests" });
    return res.status(409).json({ success: false, message: "Only your pending leave requests may be deleted" });
  } catch (error) { return fail(res, error, "delete"); }
};

module.exports = { createLeave, listLeaves, getLeave, updateLeave, reviewLeave, deleteLeave };
