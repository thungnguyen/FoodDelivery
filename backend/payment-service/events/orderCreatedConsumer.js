const crypto = require("crypto");
const Payment = require("../models/PaymentModel");
const { publish, consume } = require("../src/rabbitmq");

const ORDER_QUEUE = process.env.RABBITMQ_PAYMENT_QUEUE || "payment-service.order-created";

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

const startPaymentEventConsumers = async () => {
  await consume(ORDER_QUEUE, "order.created", handleOrderCreated);
};

module.exports = {
  startPaymentEventConsumers,
};
