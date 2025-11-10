import { createOrdersFromCart } from "../lib/cartOrderSplitter.js";

export const handleStripePaymentSuccess = async (payload = {}, routingKey) => {
    try {
        const createdOrders = await createOrdersFromCart({
            ...payload,
            paymentMethod: payload.paymentMethod || "card",
            paymentStatus: payload.paymentStatus || "Paid",
            status: payload.status || "Pending"
        });

        console.log(
            `[order-service] Created ${createdOrders.length} order(s) from Stripe payment ${
                payload?.paymentIntentId || payload?.paymentId || routingKey || "unknown"
            }`
        );
    } catch (error) {
        console.error("[order-service] Failed to process Stripe payment success event:", error.message);
        throw error;
    }
};

export default handleStripePaymentSuccess;
