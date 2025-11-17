const crypto = require("crypto");
const Payment = require("../models/PaymentModel");
const { publish, consume } = require("../src/rabbitmq");

const ORDER_QUEUE = process.env.RABBITMQ_PAYMENT_QUEUE || "payment-service.order-created";
const CANCELLATION_QUEUE =
  process.env.RABBITMQ_PAYMENT_CANCEL_QUEUE || "payment-service.order-cancelled";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeSecretKey ? require("stripe")(stripeSecretKey) : null;

const upsertPaymentRecord = async (snapshot) => {
  const amount = Number(snapshot.totalPrice || snapshot.itemsTotal || 0) || 0;
  const update = {
    userId: snapshot.customerId || snapshot.customerEmail || "unknown",
    amount,
    currency: "usd",
    email: snapshot.customerEmail || "unknown@example.com",
    phone: snapshot.customerPhone || "+1000000000",
    status: snapshot.paymentMethod === "card" ? "Paid" : "Pending",
  };

  const payment = await Payment.findOneAndUpdate(
    { orderId: snapshot.orderId },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return payment;
};

const handleOrderCreated = async (payload) => {
  if (!payload?.orderId) {
    return;
  }

  const paymentMethod =
    payload.paymentMethod && payload.paymentMethod.toLowerCase() === "card"
      ? "card"
      : "cash";

  try {
    await upsertPaymentRecord({
      ...payload,
      paymentMethod,
    });
  } catch (error) {
    console.error("[payment-service] Failed to upsert payment record:", error.message);
    return;
  }

  const eventPayload = {
    orderId: payload.orderId,
    restaurantId: payload.restaurantId,
    customerId: payload.customerId,
    amount: Number(payload.totalPrice || 0) || 0,
    paymentMethod,
    paymentStatus: paymentMethod === "card" ? "Paid" : "Pending",
    fundSource: paymentMethod === "card" ? "online" : "cod",
    orderSnapshot: payload,
    transactionId: paymentMethod === "card" ? crypto.randomUUID() : null,
    sourceEventId: null,
  };

  const nextEvent = paymentMethod === "card" ? "payment.success" : "payment.cod.pending";
  await publish(nextEvent, eventPayload);
};

const determineRefundAmount = (payload, payment) => {
  const payloadAmount = Number(payload?.totalPrice ?? payload?.amount);
  if (Number.isFinite(payloadAmount) && payloadAmount > 0) {
    return payloadAmount;
  }
  if (Number.isFinite(payment?.amount) && payment.amount > 0) {
    return payment.amount;
  }
  return 0;
};

const createRefundRecord = async ({ payment, amount }) => {
  if (!amount || amount <= 0) {
    throw new Error("Refund amount must be greater than zero");
  }
  if (stripe && payment.stripePaymentIntentId) {
    const cents = Math.round(amount * 100);
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: cents,
    });
    return refund;
  }
  return {
    id: `re_mock_${Date.now()}`,
    status: "succeeded",
    amount: Math.round(amount * 100),
    currency: payment.currency || "usd",
  };
};

const handleOrderCancelled = async (payload) => {
  const orderId = payload?.orderId;
  if (!orderId) {
    return;
  }

  const payment = await Payment.findOne({ orderId });
  if (!payment) {
    console.warn(`[payment-service] No payment record for cancelled order ${orderId}`);
    return;
  }

  if ((payment.paymentMethod || "").toLowerCase() !== "card") {
    return;
  }

  if (payment.status === "Refunded" || payment.refund?.status === "succeeded") {
    return;
  }

  if (payment.status !== "Paid") {
    console.warn(`[payment-service] Order ${orderId} cancellation received but payment status is ${payment.status}`);
    return;
  }

  const refundAmount = determineRefundAmount(payload, payment);
  if (!refundAmount) {
    console.warn(`[payment-service] Refund amount missing for order ${orderId}`);
    return;
  }

  try {
    const refund = await createRefundRecord({ payment, amount: refundAmount });
    const normalizedAmount = Number.isFinite(Number(refund.amount))
      ? Math.round(Number(refund.amount)) / 100
      : refundAmount;

    payment.status = "Refunded";
    payment.refund = {
      refundId: refund.id || `refund_${Date.now()}`,
      amount: normalizedAmount,
      currency: refund.currency || payment.currency || "usd",
      status: refund.status || "succeeded",
      processedAt: new Date(),
      reason: payload?.reason || "order_cancelled",
    };
    await payment.save();

    await publish("payment.refunded", {
      orderId,
      refundId: payment.refund.refundId,
      refundAmount: normalizedAmount,
      currency: payment.refund.currency,
      refundStatus: payment.refund.status,
      paymentIntentId: payment.stripePaymentIntentId,
      customerId: payment.userId,
      cancelledBy: payload?.cancelledBy || null,
      role: payload?.role || null,
      reason: payment.refund.reason,
    });
  } catch (error) {
    console.error(`[payment-service] Failed to refund order ${orderId}:`, error.message);
  }
};

const startPaymentEventConsumers = async () => {
  await consume(ORDER_QUEUE, "order.created", handleOrderCreated);
  await consume(CANCELLATION_QUEUE, "order.cancelled.internal", handleOrderCancelled);
};

module.exports = {
  startPaymentEventConsumers,
};
