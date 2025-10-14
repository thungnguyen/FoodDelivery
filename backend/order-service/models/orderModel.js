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
        deliveryAddress: { type: String, required: true }
    },
    { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
