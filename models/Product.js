const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    condition: { type: String, required: true, trim: true },
    images: [{ type: String, required: true }],
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["active", "sold", "hidden"], default: "active" },
    pickupLocation: { type: String, trim: true, default: "" },
    negotiable: { type: Boolean, default: true },
    urgency: {
      type: String,
      enum: ["none", "moving_out", "flash_sale"],
      default: "none",
    },
  },
  { timestamps: true }
);

productSchema.index({ title: "text", description: "text" });
productSchema.index({ category: 1, createdAt: -1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, category: 1, createdAt: -1 });

module.exports = mongoose.model("Product", productSchema);
