const mongoose = require("mongoose");

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const parseDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed;
};

const buildContentController = ({ Model, label, fields, dateFields = [], enums = {}, optionalFields = [], listFilter = () => ({}), canView = () => true }) => {
  const validate = (body, { partial = false } = {}) => {
    if (!isObject(body)) return "Request body must be a JSON object";
    if (!Object.keys(body).length) return "Request body must contain fields";
    const allowed = fields.filter((field) => field !== "createdBy" && field !== "publishedBy");
    if (Object.keys(body).some((key) => !allowed.includes(key))) return "Request contains unsupported or protected fields";
    const clean = {};
    for (const field of allowed) {
      const value = body[field];
      if (value === undefined && optionalFields.includes(field)) continue;
      if (value === undefined && partial) continue;
      if (value === undefined || value === null) return `${field} is required`;
      if (dateFields.includes(field)) {
        clean[field] = parseDate(value);
        if (!clean[field]) return `${field} must be a valid YYYY-MM-DD date`;
      } else if (enums[field]) {
        if (!enums[field].includes(value)) return `${field} must be one of: ${enums[field].join(", ")}`;
        clean[field] = value;
      } else {
        if (typeof value !== "string" || !value.trim()) return `${field} must be non-empty text`;
        clean[field] = value.trim();
      }
    }
    const start = clean.startDate;
    const end = clean.endDate;
    if (start && end && end < start) return "endDate must be on or after startDate";
    return clean;
  };

  const errorResponse = (res, error, action) => {
    if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ success: false, message: error.message });
    console.error(`${action} ${label} error:`, error.name);
    return res.status(500).json({ success: false, message: `Failed to ${action} ${label}` });
  };
  const populate = (query) => query.populate(fields.includes("createdBy") ? "createdBy" : "publishedBy", "name email role");

  return {
    list: async (_req, res) => {
      try {
        const records = await populate(Model.find(listFilter(_req)).sort({ createdAt: -1, _id: -1 }));
        return res.status(200).json({ success: true, count: records.length, [label + "s"]: records });
      } catch (error) { return errorResponse(res, error, "list"); }
    },
    get: async (req, res) => {
      try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: `Invalid ${label} ID` });
        const record = await populate(Model.findById(req.params.id));
        if (!record) return res.status(404).json({ success: false, message: `${label} not found` });
        if (!canView(record, req)) return res.status(404).json({ success: false, message: `${label} not found` });
        return res.status(200).json({ success: true, [label]: record });
      } catch (error) { return errorResponse(res, error, "fetch"); }
    },
    create: async (req, res) => {
      try {
        const validated = validate(req.body);
        if (typeof validated === "string") return res.status(400).json({ success: false, message: validated });
        const actorField = fields.includes("createdBy") ? "createdBy" : "publishedBy";
        const record = await Model.create({ ...validated, [actorField]: new mongoose.Types.ObjectId(req.user.id) });
        await record.populate(actorField, "name email role");
        return res.status(201).json({ success: true, message: `${label} created`, [label]: record });
      } catch (error) { return errorResponse(res, error, "create"); }
    },
    update: async (req, res) => {
      try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: `Invalid ${label} ID` });
        const validated = validate(req.body, { partial: true });
        if (typeof validated === "string") return res.status(400).json({ success: false, message: validated });
        const current = await Model.findById(req.params.id);
        if (!current) return res.status(404).json({ success: false, message: `${label} not found` });
        const start = validated.startDate || current.startDate;
        const end = validated.endDate || current.endDate;
        if (start && end && end < start) return res.status(400).json({ success: false, message: "endDate must be on or after startDate" });
        const record = await populate(Model.findByIdAndUpdate(req.params.id, validated, { new: true, runValidators: true }));
        return res.status(200).json({ success: true, message: `${label} updated`, [label]: record });
      } catch (error) { return errorResponse(res, error, "update"); }
    },
    remove: async (req, res) => {
      try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: `Invalid ${label} ID` });
        const record = await populate(Model.findByIdAndDelete(req.params.id));
        if (!record) return res.status(404).json({ success: false, message: `${label} not found` });
        return res.status(200).json({ success: true, message: `${label} deleted`, [label]: record });
      } catch (error) { return errorResponse(res, error, "delete"); }
    },
  };
};

module.exports = { buildContentController };
