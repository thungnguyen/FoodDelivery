import { publish as publishRabbit } from "../src/rabbitmq.js";

const { REALTIME_SERVICE_URL, SERVICE_INTERNAL_KEY = "super-admin-internal-key", NODE_ENV } =
    process.env;

const shouldEmitHttp = Boolean(REALTIME_SERVICE_URL);
let hasWarnedRealtime = false;

export const emitEvent = async ({ event, payload, rooms, broadcast }) => {
    if (!event) {
        return;
    }

    if (!shouldEmitHttp && !hasWarnedRealtime && NODE_ENV === "development") {
        console.warn("[order-service] REALTIME_SERVICE_URL is not configured. Falling back to RabbitMQ only.");
        hasWarnedRealtime = true;
    }

    if (shouldEmitHttp) {
        try {
            await fetch(`${REALTIME_SERVICE_URL.replace(/\/$/, "")}/internal/events`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-service-key": SERVICE_INTERNAL_KEY
                },
                body: JSON.stringify({ event, payload, rooms, broadcast })
            });
        } catch (error) {
            console.error("[order-service] Failed to emit realtime event via HTTP:", error.message);
        }
    }

    await publishRabbit(event, {
        payload,
        rooms,
        broadcast,
        channel: "realtime"
    });
};

export default emitEvent;
