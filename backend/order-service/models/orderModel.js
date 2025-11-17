import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
    {
        customerId: { type: String, required: true }, // Change to String to allow manual input
        customerName: { type: String },
        customerEmail: { type: String },
        customerPhone: { type: String },
        restaurantId: { type: String, required: true }, // Change to String for manual input
        restaurantName: { type: String },
        items: [
            {
                foodId: { type: String, required: true }, // Change to String for manual input
                foodName: { type: String },
                quantity: { type: Number, required: true },
                price: { type: Number, required: true }
            }
        ],
        itemsTotal: { type: Number, default: 0 },
        shippingFee: { type: Number, default: 0 },
        discountTotal: { type: Number, default: 0 },
        totalPrice: { type: Number, required: true },
        promotion: {
            code: { type: String },
            promotionId: { type: String },
            type: { type: String, enum: ["PERCENT", "FIXED"] },
            value: { type: Number },
            discountAmount: { type: Number, default: 0 },
            restaurantId: { type: String },
            status: { type: String },
            appliedAt: { type: Date }
        },
        paymentMethod: { type: String, enum: ["card", "cash"], default: "cash" },
        paymentStatus: { type: String, enum: ["Pending", "Paid", "Failed", "Refunded"], default: "Pending" },
        paymentIntentId: { type: String },
        paymentId: { type: String },
        status: {
            type: String,
            enum: [
                "Pending",
                "Confirmed",
                "Preparing",
                "Delivering",
                "Completed",
                "Cancelled",
                "Failed",
                "Refunded"
            ],
            default: "Pending"
        },
        deliveryAddress: { type: String, required: true },
        deliveryFeedback: {
            rating: {
                type: Number,
                min: 1,
                max: 5
            },
            comment: {
                type: String,
                trim: true,
                maxlength: 1000
            },
            ratedAt: { type: Date }
        },
        orderFeedback: {
            rating: {
                type: Number,
                min: 1,
                max: 5
            },
            comment: {
                type: String,
                trim: true,
                maxlength: 1000
            },
            ratedAt: { type: Date }
        },
        financialSummary: {
            fundSource: {
                type: String,
                enum: ["online", "cod"]
            },
            vatRate: { type: Number, default: 0 },
            grossItems: { type: Number, default: 0 },
            itemsNet: { type: Number, default: 0 },
            vatAmount: { type: Number, default: 0 },
            shippingFee: { type: Number, default: 0 },
            commissionAmount: { type: Number, default: 0 },
            maintenanceFee: { type: Number, default: 0 },
            driverPayout: { type: Number, default: 0 },
            driverServiceFee: { type: Number, default: 0 },
            restaurantShippingShare: { type: Number, default: 0 },
            netRestaurant: { type: Number, default: 0 },
            taxLiability: { type: Number, default: 0 },
            totalHeld: { type: Number, default: 0 },
            settlementDirection: {
                type: String,
                enum: ["payable_to_restaurant", "collect_from_restaurant", "even"]
            },
            restaurantWalletBalance: { type: Number, default: 0 },
            processedAt: { type: Date },
            refundAmount: { type: Number, default: 0 },
            refundTransactionId: { type: String },
            refundStatus: { type: String }
        }
    },
    { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
