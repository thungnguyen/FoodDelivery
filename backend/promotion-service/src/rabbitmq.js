import amqp from "amqplib";

const RABBIT_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const EXCHANGE = process.env.RABBITMQ_EXCHANGE || "app.direct";

let channel = null;
let connection = null;
let initializing = null;

export const initRabbit = async () => {
  if (channel) {
    return channel;
  }
  if (initializing) {
    return initializing;
  }

  initializing = (async () => {
    connection = await amqp.connect(RABBIT_URL);
    connection.on("close", () => {
      channel = null;
      initializing = null;
      console.warn("[promotion-service] RabbitMQ connection closed");
    });
    connection.on("error", (error) => {
      console.error("[promotion-service] RabbitMQ error", error.message);
    });
    channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, "direct", { durable: true });
    console.log(`[promotion-service] Connected to RabbitMQ ${RABBIT_URL}`);
    initializing = null;
    return channel;
  })().catch((error) => {
    initializing = null;
    channel = null;
    console.error("[promotion-service] Failed to connect RabbitMQ", error.message);
    throw error;
  });

  return initializing;
};

export const publishEvent = async (routingKey, payload = {}) => {
  try {
    const ch = await initRabbit();
    const ok = ch.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: "application/json"
    });
    if (!ok) {
      console.warn(`[promotion-service] publish backpressure for ${routingKey}`);
    }
  } catch (error) {
    console.error(`[promotion-service] Failed to publish ${routingKey}`, error.message);
  }
};
