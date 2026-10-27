
const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    department: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    position: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    salary: {
      type: Number,
      required: true,
      min: 0,
    },
    joinDate: {
      type: Date,
      required: true,
    },
    phone: {
      type: String,
      maxlength: 40,
    },
    address: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Employee", employeeSchema, "Employees");
