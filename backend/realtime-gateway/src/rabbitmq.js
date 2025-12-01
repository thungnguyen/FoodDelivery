import amqp from "amqplib";

const DEFAULT_URL = process.env.RABBITMQ_URL || "amqp://26.32.188.49:5672";
const EXCHANGE = process.env.RABBITMQ_EXCHANGE || "app.direct";

let connection = null;
let channel = null;
let connecting = null;

const ensureChannel = async () => {
  if (channel) {
    return channel;
  }
  await connectRabbitMQ();
  if (!channel) {
    throw new Error("[rabbitmq] Failed to initialize channel.");
  }
  return channel;
};

export const connectRabbitMQ = async (url = DEFAULT_URL) => {
  if (channel) {
    return channel;
  }
  if (connecting) {
    return connecting;
  }

  connecting = (async () => {
    connection = await amqp.connect(url);
    connection.on("close", () => {
      console.warn("[rabbitmq] Connection closed");
      channel = null;
      connecting = null;
    });
    connection.on("error", (error) => {
      console.error("[rabbitmq] Connection error:", error.message);
    });

    channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, "direct", { durable: true });
    console.log(`[rabbitmq] Connected to ${url} (exchange=${EXCHANGE})`);
    connecting = null;
    return channel;
  })().catch((error) => {
    channel = null;
    connecting = null;
    console.error("[rabbitmq] Failed to connect:", error.message);
    throw error;
  });

  return connecting;
};

export const consume = async (queue, routingKeys, handler) => {
  if (!queue) {
    throw new Error("queue is required for RabbitMQ consumers");
  }
  if (typeof handler !== "function") {
    throw new Error("handler must be a function for RabbitMQ consumers");
  }

  const routes = Array.isArray(routingKeys)
    ? routingKeys.filter(Boolean)
    : routingKeys
    ? [routingKeys]
    : [];
  if (!routes.length) {
    throw new Error("At least one routing key is required for RabbitMQ consumers");
  }

  const ch = await ensureChannel();
  const assertedQueue = await ch.assertQueue(queue, { durable: true });
  for (const route of routes) {
    await ch.bindQueue(assertedQueue.queue, EXCHANGE, route);
  }

  await ch.consume(assertedQueue.queue, async (message) => {
    if (!message) {
      return;
    }
    try {
      const payload = JSON.parse(message.content.toString() || "{}");
      await handler(payload, message.fields.routingKey);
      ch.ack(message);
    } catch (error) {
      console.error("[rabbitmq] Consumer handler failed:", error.message);
      ch.nack(message, false, false);
    }
  });

  console.log(`[rabbitmq] Consuming queue=${assertedQueue.queue} routes=${routes.join(",")}`);
};
