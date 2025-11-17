import Order from "../models/orderModel.js";
import emitEvent from "../utils/eventBus.js";
import buildOrderRooms from "../utils/realtimeRooms.js";
import { publish as publishRabbit, consume } from "../src/rabbitmq.js";
import { handleStripePaymentSuccess } from "../src/events/stripePaymentSuccess.handler.js";
import { handleOrderStatusFinancials } from "../services/orderFinanceService.js";

const PAYMENT_QUEUE = process.env.RABBITMQ_PAYMENT_QUEUE || "order-service.payments";
const DELIVERY_QUEUE = process.env.RABBITMQ_DELIVERY_QUEUE || "order-service.delivery";
const STRIPE_QUEUE = process.env.RABBITMQ_STRIPE_QUEUE || "order-service.stripe-payments";
const STRIPE_SUCCESS_ROUTING = process.env.RABBITMQ_STRIPE_SUCCESS_ROUTING || "stripe.payment.succeeded";

const normalizePaymentMethod = (value) => {
    return value && value.toLowerCase() === "card" ? "card" : "cash";
};

const handlePaymentEvent = async (payload, routingKey) => {
    const orderId = payload?.orderId;
    if (!orderId) {
        return;
    }

    const order = await Order.findById(orderId);
    if (!order) {
        console.warn(`[order-service] Payment event received for unknown order ${orderId}`);
        return;
    }

    const nextPaymentMethod = normalizePaymentMethod(payload?.paymentMethod || order.paymentMethod);
    order.paymentMethod = nextPaymentMethod;

    let realtimeEvent = null;
    let realtimePayload = null;

    if (routingKey === "payment.success") {
        if (order.paymentStatus !== "Paid") {
            order.paymentStatus = "Paid";
        }
        order.financialSummary = {
            ...(order.financialSummary || {}),
            fundSource: "online"
        };
    } else if (routingKey === "payment.cod.pending") {
        order.paymentStatus = "Pending";
        order.financialSummary = {
            ...(order.financialSummary || {}),
            fundSource: "cod"
        };
    } else if (routingKey === "payment.refunded") {
        order.paymentStatus = "Refunded";
        if (order.status === "Cancelled") {
            order.status = "Refunded";
        }
        const refundAmount = Number(payload?.refundAmount ?? order.totalPrice ?? 0);
        order.financialSummary = {
            ...(order.financialSummary || {}),
            fundSource: "online",
            refundAmount: refundAmount > 0 ? refundAmount : order.financialSummary?.refundAmount || 0,
            refundTransactionId: payload?.refundId || payload?.transactionId || null,
            refundStatus: payload?.refundStatus || "succeeded"
        };
        realtimeEvent = "order.refunded";
        realtimePayload = {
            orderId: order._id,
            status: order.status,
            refundAmount: refundAmount > 0 ? refundAmount : order.totalPrice,
            currency: payload?.currency || "VND",
            reason: payload?.reason || "order_cancelled"
        };
    }

    await order.save();

    if (realtimeEvent) {
        await emitEvent({
            event: realtimeEvent,
            payload: realtimePayload,
            rooms: buildOrderRooms({
                orderId: order._id,
                customerId: order.customerId,
                restaurantId: order.restaurantId
            })
        });
    }
};

const handleDeliveryCompleted = async (payload) => {
    const orderId = payload?.orderId;
    if (!orderId) {
        return;
    }

    const session = await Order.startSession();
    let settlementSummary = null;
    let updatedOrder = null;

    try {
        await session.withTransaction(async () => {
            const order = await Order.findById(orderId).session(session);
            if (!order) {
                console.warn(`[order-service] delivery.completed received for missing order ${orderId}`);
                return;
            }

            const previousStatus = order.status;
            if (previousStatus === "Completed") {
                updatedOrder = order;
                return;
            }

            order.status = "Completed";
            if (payload?.paymentStatus && order.paymentStatus !== payload.paymentStatus) {
                order.paymentStatus = payload.paymentStatus;
            }

            const financeSummary = await handleOrderStatusFinancials({
                order,
                previousStatus,
                session
            });

            if (financeSummary) {
                order.financialSummary = {
                    ...(order.financialSummary || {}),
                    ...financeSummary
                };
                settlementSummary = {
                    orderId: order._id.toString(),
                    restaurantId: order.restaurantId,
                    customerId: order.customerId,
                    financialSummary: order.financialSummary
                };
            }

            await order.save({ session });
            updatedOrder = order;
        });
    } catch (error) {
        console.error("[order-service] Failed to process delivery.completed:", error.message);
    } finally {
        await session.endSession();
    }

    if (updatedOrder) {
        await emitEvent({
            event: "order.status.changed",
            payload: {
                orderId: updatedOrder._id,
                status: updatedOrder.status,
                updatedBy: "system",
                role: "admin"
            },
            rooms: buildOrderRooms({
                orderId: updatedOrder._id,
                customerId: updatedOrder.customerId,
                restaurantId: updatedOrder.restaurantId
            })
        });
    }

    if (settlementSummary) {
        await publishRabbit("settlement.ready", settlementSummary);
    }
};

export const startOrderEventConsumers = async () => {
    await consume(PAYMENT_QUEUE, ["payment.success", "payment.cod.pending", "payment.refunded"], handlePaymentEvent);
    await consume(DELIVERY_QUEUE, "delivery.completed", handleDeliveryCompleted);
    await consume(STRIPE_QUEUE, STRIPE_SUCCESS_ROUTING, handleStripePaymentSuccess);
};
