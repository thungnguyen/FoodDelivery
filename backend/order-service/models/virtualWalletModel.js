import mongoose from "mongoose";
import { WALLET_TYPES } from "../config/financeConfig.js";

const walletSchema = new mongoose.Schema(
    {
        walletType: {
            type: String,
            enum: Object.values(WALLET_TYPES),
            required: true
        },
        ownerId: {
            type: String,
            required: true
        },
        normalBalance: {
            type: String,
            enum: ["debit", "credit"],
            required: true
        },
        balance: {
            type: Number,
            default: 0
        },
        currency: {
            type: String,
            default: "VND"
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed
        },
        lastSettlementAt: {
            type: Date
        }
    },
    { timestamps: true }
);

walletSchema.index({ walletType: 1, ownerId: 1 }, { unique: true });

const VirtualWallet = mongoose.model("VirtualWallet", walletSchema);
export default VirtualWallet;
