import mongoose from "mongoose";

const settlementTransactionSchema = new mongoose.Schema(
  {
    orderId: { type: String },
    grossSales: { type: Number, default: 0 },
    fees: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 }
  },
  { _id: false }
);

const settlementSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    grossSales: { type: Number, default: 0 },
    fees: { type: Number, default: 0 },
    netTransfer: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "ready", "paid"], default: "pending" },
    transactions: [settlementTransactionSchema],
    notes: { type: String, default: "" },
    paidAt: { type: Date }
  },
  { timestamps: true }
);

settlementSchema.index({ restaurantId: 1, periodStart: 1 }, { unique: true });

export default mongoose.model("Settlement", settlementSchema);
