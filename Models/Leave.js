const mongoose = require("mongoose");

const leaveSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  startDate: { type: Date, required: true },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator(value) { return !this.startDate || value >= this.startDate; },
      message: "endDate must be on or after startDate",
    },
  },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  approverRole: { type: String, enum: ["HR", "Manager"] },
  createdAt: { type: Date, default: Date.now },
}, { collection: "LeaveRequests" });

leaveSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Leave", leaveSchema, "LeaveRequests");
