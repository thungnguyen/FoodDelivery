import mongoose from "mongoose";

const promotionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["PERCENT", "FIXED"], default: "PERCENT" },
    value: { type: Number, required: true },
    minOrder: { type: Number, default: 0 },
    maxDiscount: { type: Number },
    restaurantId: { type: String, default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    usageLimit: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SCHEDULED", "PAUSED", "EXPIRED"],
      default: "ACTIVE"
    },
    description: { type: String, default: "" }
  },
  { timestamps: true }
);

promotionSchema.index({ code: 1 }, { unique: true });

export default mongoose.model("Promotion", promotionSchema);
