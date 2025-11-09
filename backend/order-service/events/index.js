import Order from "../models/orderModel.js";
import emitEvent from "../utils/eventBus.js";
import buildOrderRooms from "../utils/realtimeRooms.js";
import { publish as publishRabbit, consume } from "../src/rabbitmq.js";
import { handleOrderStatusFinancials } from "../services/orderFinanceService.js";

const PAYMENT_QUEUE = process.env.RABBITMQ_PAYMENT_QUEUE || "order-service.payments";
const DELIVERY_QUEUE = process.env.RABBITMQ_DELIVERY_QUEUE || "order-service.delivery";

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
    }

    await order.save();
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
    await consume(PAYMENT_QUEUE, ["payment.success", "payment.cod.pending"], handlePaymentEvent);
    await consume(DELIVERY_QUEUE, "delivery.completed", handleDeliveryCompleted);
};
