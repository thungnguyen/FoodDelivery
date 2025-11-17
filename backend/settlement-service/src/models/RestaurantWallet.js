import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["order", "payout", "adjustment"], default: "order" },
    direction: { type: String, enum: ["credit", "debit"], default: "credit" },
    orderId: { type: String },
    grossSales: { type: Number, default: 0 },
    fees: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    description: { type: String, default: "" },
    settlementId: { type: mongoose.Schema.Types.ObjectId, ref: "Settlement", default: null },
    settled: { type: Boolean, default: false },
    settledAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const restaurantWalletSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true, unique: true },
    pendingAmount: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    transactions: [transactionSchema],
    lastSettlementAt: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model("RestaurantWallet", restaurantWalletSchema);
