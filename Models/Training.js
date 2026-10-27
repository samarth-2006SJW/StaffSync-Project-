const mongoose = require("mongoose");

const trainingSchema = new mongoose.Schema({
  title: { type: String, required: [true, "Training title is required"], trim: true },
  description: { type: String, required: [true, "Description is required"], trim: true },
  date: { type: Date, required: [true, "Training date is required"] },
  trainer: { type: String, default: "TBD", trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true, collection: "TrainingPrograms" });

trainingSchema.index({ date: 1 });
trainingSchema.index({ assignedTo: 1 });

module.exports = mongoose.model("Training", trainingSchema, "TrainingPrograms");
