import mongoose from "mongoose";

const settlementInvoiceSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: String,
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: ["pending", "paid", "cancelled"],
            default: "pending"
        },
        generatedAt: {
            type: Date,
            default: Date.now
        },
        dueDate: {
            type: Date
        },
        source: {
            type: String,
            enum: ["cod_debt"],
            default: "cod_debt"
        },
        orderIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Order"
            }
        ],
        metadata: {
            type: mongoose.Schema.Types.Mixed
        }
    },
    { timestamps: true }
);

settlementInvoiceSchema.index({ restaurantId: 1, status: 1 });

const SettlementInvoice = mongoose.model("SettlementInvoice", settlementInvoiceSchema);
export default SettlementInvoice;
