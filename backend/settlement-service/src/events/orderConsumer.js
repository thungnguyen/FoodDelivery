import { consumeEvents } from "../rabbitmq.js";
import { handleOrderCompletedEvent } from "../services/cashflowService.js";

const QUEUE = process.env.SETTLEMENT_QUEUE || "settlement-service.orders";

const handleMessage = async (payload, routingKey) => {
  if (routingKey === "order.completed") {
    await handleOrderCompletedEvent(payload);
  } else if (routingKey === "settlement.ready") {
    await handleOrderCompletedEvent(payload);
  }
};

export const startOrderConsumers = async () => {
  await consumeEvents(QUEUE, ["order.completed", "settlement.ready"], handleMessage);
};
