import { consume } from "../rabbitmq.js";

const REALTIME_QUEUE = process.env.RABBITMQ_REALTIME_QUEUE || "realtime-gateway.events";

const createRealtimeHandler = (emitToClients) => async (payload, routingKey) => {
  const eventName = routingKey || payload?.event;
  if (!eventName) {
    return;
  }

  if (typeof emitToClients !== "function") {
    console.warn("[realtime-gateway] emitToClients is not available for RabbitMQ handler");
    return;
  }

  const rooms = Array.isArray(payload?.rooms) ? payload.rooms : undefined;
  const broadcast =
    typeof payload?.broadcast === "boolean"
      ? payload.broadcast
      : !rooms || rooms.length === 0;
  const resolvedPayload =
    payload && Object.prototype.hasOwnProperty.call(payload, "payload")
      ? payload.payload
      : payload;

  emitToClients({
    event: eventName,
    payload: resolvedPayload,
    rooms,
    broadcast,
  });
};

export const startRealtimeConsumers = async (emitToClients) => {
  await consume(
    REALTIME_QUEUE,
    ["order.status.changed", "delivery.completed"],
    createRealtimeHandler(emitToClients)
  );
};
