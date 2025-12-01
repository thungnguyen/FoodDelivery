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
        throw new Error("[rabbitmq] Failed to initialize RabbitMQ channel.");
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
            channel = null;
            connecting = null;
            console.warn("[rabbitmq] Connection closed. Call connectRabbitMQ() to reconnect.");
        });
        connection.on("error", (err) => {
            console.error("[rabbitmq] Connection error:", err.message);
        });

        channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, "direct", { durable: true });
        console.log(`[rabbitmq] Connected to ${url} (exchange=${EXCHANGE})`);
        connecting = null;
        return channel;
    })().catch((error) => {
        channel = null;
        connecting = null;
        console.error("[rabbitmq] Failed to establish connection:", error.message);
        throw error;
    });

    return connecting;
};

export const publish = async (routingKey, payload = {}) => {
    if (!routingKey) {
        throw new Error("routingKey is required when publishing to RabbitMQ");
    }
    try {
        const ch = await ensureChannel();
        const body = Buffer.from(JSON.stringify(payload));
        const ok = ch.publish(EXCHANGE, routingKey, body, {
            contentType: "application/json",
            persistent: true
        });
        if (!ok) {
            console.warn(`[rabbitmq] publish backpressure detected for ${routingKey}`);
        }
        return true;
    } catch (error) {
        console.error(`[rabbitmq] Failed to publish ${routingKey}:`, error.message);
        return false;
    }
};

const normalizeRouting = (routingKeys) => {
    if (Array.isArray(routingKeys)) {
        return routingKeys.filter(Boolean);
    }
    return routingKeys ? [routingKeys] : [];
};

export const consume = async (queue, routingKeys, handler) => {
    if (!queue) {
        throw new Error("queue is required for RabbitMQ consumers");
    }
    if (typeof handler !== "function") {
        throw new Error("handler must be a function for RabbitMQ consumers");
    }
    const routes = normalizeRouting(routingKeys);
    if (!routes.length) {
        throw new Error("At least one routing key is required for RabbitMQ consumers");
    }

    const ch = await ensureChannel();
    const assertedQueue = await ch.assertQueue(queue, { durable: true });

    for (const routingKey of routes) {
        await ch.bindQueue(assertedQueue.queue, EXCHANGE, routingKey);
    }

    await ch.consume(assertedQueue.queue, async (message) => {
        if (!message) {
            return;
        }
        try {
            const content = message.content.toString() || "{}";
            const data = JSON.parse(content);
            await handler(data, message.fields.routingKey);
            ch.ack(message);
        } catch (error) {
            console.error("[rabbitmq] Consumer handler failed:", error.message);
            ch.nack(message, false, false);
        }
    });

    console.log(`[rabbitmq] Consuming queue=${assertedQueue.queue} routes=${routes.join(",")}`);
};
