const mongoose = require("mongoose");
const toCampusKey = require("../utils/campusKey");

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    condition: { type: String, required: true, trim: true },
    images: [{ type: String, required: true }],
    /** Optional known slug (legacy / curated list). */
    collegeId: {
      type: String,
      trim: true,
      maxlength: 48,
      default: "",
    },
    /** Copied from seller at listing time — any institute name. */
    campusName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    /**
     * Normalized copy of campusName ("mnit jaipur"), set automatically before saving.
     * Campus filters use an exact match on it, which an index can serve.
     */
    campusKey: { type: String, default: "" },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "sold", "hidden"], default: "active" },
    pickupLocation: { type: String, trim: true, default: "" },
    negotiable: { type: Boolean, default: true },
    urgency: {
      type: String,
      enum: ["none", "moving_out", "flash_sale"],
      default: "none",
    },
    /** Free-text tag when urgency is "none" (e.g. "Exam week rush") */
    urgencyNote: { type: String, trim: true, maxlength: 120, default: "" },
  },
  { timestamps: true }
);

productSchema.pre("validate", function setCampusKey() {
  this.campusKey = toCampusKey(this.campusName);
});

// Index order follows the ESR rule: Equality fields first (status, category, ...),
// then the Sort fields (createdAt, _id). createdAt is also the 30-day range filter.
// _id is the tie-breaker, so listings with the same createdAt have a fixed order
// and pagination never shows one listing twice or skips one.
productSchema.index({ title: "text", description: "text" });
productSchema.index({ category: 1, createdAt: -1 });
productSchema.index({ status: 1, createdAt: -1, _id: -1 });
productSchema.index({ status: 1, category: 1, createdAt: -1, _id: -1 });
productSchema.index({ status: 1, collegeId: 1, createdAt: -1, _id: -1 });
productSchema.index({ status: 1, campusKey: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model("Product", productSchema);
