import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
    {
        customerId: { type: String, required: true }, // Change to String to allow manual input
        customerName: { type: String },
        customerEmail: { type: String },
        customerPhone: { type: String },
        restaurantId: {
            type: String,
            required() {
                return !this.isParentOrder;
            }
        }, // Change to String for manual input
        restaurantName: { type: String },
        items: [
            {
                foodId: { type: String, required: true }, // Change to String for manual input
                foodName: { type: String },
                restaurantId: { type: String },
                restaurantName: { type: String },
                quantity: { type: Number, required: true },
                price: { type: Number, required: true }
            }
        ],
        itemsTotal: { type: Number, default: 0 },
        shippingFee: { type: Number, default: 0 },
        totalPrice: { type: Number, required: true },
        paymentMethod: { type: String, enum: ["card", "cash"], default: "cash" },
        paymentStatus: { type: String, enum: ["Pending", "Paid", "Failed"], default: "Pending" },
        status: {
            type: String,
            enum: [
                "Pending Confirmation",
                "Pending",
                "Confirmed",
                "Preparing",
                "Awaiting Driver",
                "Ready for Delivery",
                "Out for Delivery",
                "Delivered",
                "Completed",
                "Cancelled",
                "Canceled",
                "Failed",
                "Failed/Undeliverable",
                "Refunded"
            ],
            default: "Pending Confirmation"
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
        isParentOrder: { type: Boolean, default: false },
        parentOrderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            default: null
        },
        childOrderIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Order"
            }
        ],
        childOrderSummaries: [
            {
                orderId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Order",
                    required: true
                },
                restaurantId: { type: String },
                restaurantName: { type: String },
                itemsTotal: { type: Number },
                shippingFee: { type: Number },
                totalPrice: { type: Number },
                status: { type: String }
            }
        ]
    },
    { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
