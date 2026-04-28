const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  refreshTokenVersion: {
    type: Number,
    default: 0,
  },
  /** Optional known slug for nearby filters (see config/colleges.js). */
  collegeId: {
    type: String,
    trim: true,
    maxlength: 48,
  },
  /** Free-text institute name (shown on listings, filters). */
  campusName: {
    type: String,
    trim: true,
    maxlength: 120,
    default: "",
  },
  /** buyer = browse only; seller = list only intent; both = full marketplace. */
  role: {
    type: String,
    enum: ["buyer", "seller", "both"],
    default: "both",
  },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
