import amqp from "amqplib";

const RABBIT_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const EXCHANGE = process.env.RABBITMQ_EXCHANGE || "app.direct";

let connection = null;
let channel = null;
let connecting = null;

export const initRabbit = async () => {
  if (channel) {
    return channel;
  }
  if (connecting) {
    return connecting;
  }

  connecting = (async () => {
    connection = await amqp.connect(RABBIT_URL);
    connection.on("close", () => {
      channel = null;
      connecting = null;
      console.warn("[settlement-service] RabbitMQ connection closed");
    });
    connection.on("error", (error) => {
      console.error("[settlement-service] RabbitMQ error", error.message);
    });
    channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, "direct", { durable: true });
    console.log(`[settlement-service] Connected RabbitMQ ${RABBIT_URL}`);
    connecting = null;
    return channel;
  })().catch((error) => {
    channel = null;
    connecting = null;
    console.error("[settlement-service] RabbitMQ connection failed", error.message);
    throw error;
  });

  return connecting;
};

export const publishEvent = async (routingKey, payload = {}) => {
  try {
    const ch = await initRabbit();
    ch.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: "application/json"
    });
  } catch (error) {
    console.error(`[settlement-service] Failed to publish ${routingKey}`, error.message);
  }
};

export const consumeEvents = async (queueName, routingKeys, handler) => {
  const ch = await initRabbit();
  const queue = await ch.assertQueue(queueName, { durable: true });
  const keys = Array.isArray(routingKeys) ? routingKeys : [routingKeys];
  for (const key of keys) {
    await ch.bindQueue(queue.queue, EXCHANGE, key);
  }
  await ch.consume(queue.queue, async (message) => {
    if (!message) return;
    try {
      const payload = JSON.parse(message.content.toString() || "{}");
      await handler(payload, message.fields.routingKey);
      ch.ack(message);
    } catch (error) {
      console.error("[settlement-service] Consumer failed", error.message);
      ch.nack(message, false, false);
    }
  });
  console.log(`[settlement-service] Consuming ${queue.queue} for ${keys.join(", ")}`);
};
