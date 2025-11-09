import { consume } from "../rabbitmq.js";
import { getIO } from "../utils/socket.js";

const PAYMENT_QUEUE = process.env.RABBITMQ_DELIVERY_QUEUE || "delivery-service.payments";

const handlePaymentSuccess = async (payload) => {
  if (!payload?.orderId) {
    return;
  }

  console.log(`[delivery-service] payment.success received for order ${payload.orderId}`);

  try {
    const io = getIO();
    io.emit("delivery.paymentSuccess", {
      orderId: payload.orderId,
      order: payload.orderSnapshot,
    });
  } catch (error) {
    console.warn("[delivery-service] Unable to broadcast payment success to drivers:", error.message);
  }
};

export const startDeliveryEventConsumers = async () => {
  await consume(PAYMENT_QUEUE, "payment.success", handlePaymentSuccess);
};
