const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: [true, "Title is required"], trim: true },
  message: { type: String, required: [true, "Message is required"], trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
}, { collection: "Announcements" });

announcementSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Announcement", announcementSchema, "Announcements");
