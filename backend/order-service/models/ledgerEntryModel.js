import mongoose from "mongoose";
import { FUND_SOURCES, LEDGER_ENTRY_TYPES } from "../config/financeConfig.js";

const ledgerEntrySchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true
        },
        fundSource: {
            type: String,
            enum: Object.values(FUND_SOURCES),
            required: true
        },
        entryType: {
            type: String,
            enum: Object.values(LEDGER_ENTRY_TYPES),
            required: true
        },
        dedupKey: {
            type: String,
            default: "primary"
        },
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        debitWallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "VirtualWallet",
            required: true
        },
        creditWallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "VirtualWallet",
            required: true
        },
        description: {
            type: String
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed
        }
    },
    { timestamps: true }
);

ledgerEntrySchema.index(
    { orderId: 1, entryType: 1, dedupKey: 1 },
    { unique: true }
);

const LedgerEntry = mongoose.model("LedgerEntry", ledgerEntrySchema);
export default LedgerEntry;
