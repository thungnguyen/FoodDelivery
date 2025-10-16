const { REALTIME_SERVICE_URL, SERVICE_INTERNAL_KEY = 'super-admin-internal-key', NODE_ENV } =
  process.env;

const shouldEmit = Boolean(REALTIME_SERVICE_URL);

export const emitEvent = async ({ event, payload, rooms, broadcast }) => {
  if (!shouldEmit || !event) {
    if (!REALTIME_SERVICE_URL && NODE_ENV === 'development') {
      console.warn('[order-service] REALTIME_SERVICE_URL is not configured.');
    }
    return;
  }

  try {
    await fetch(`${REALTIME_SERVICE_URL.replace(/\/$/, '')}/internal/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': SERVICE_INTERNAL_KEY,
      },
      body: JSON.stringify({ event, payload, rooms, broadcast }),
    });
  } catch (error) {
    console.error('[order-service] Failed to emit realtime event:', error.message);
  }
};

export default emitEvent;
