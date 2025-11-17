// Centralized service endpoints so the UI can switch environments without touching component code
const fallback = (...values) => {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (typeof value === 'string' && value.trim().length) {
      return value.trim();
    }
  }
  const last = values[values.length - 1];
  return typeof last === 'string' ? last : '';
};

export const AUTH_SERVICE_URL = fallback(
  process.env.REACT_APP_AUTH_URL || process.env.REACT_APP_BACKEND_URL,
  "http://localhost:4000"
);

export const RESTAURANT_SERVICE_URL = fallback(
  process.env.REACT_APP_RESTAURANT_URL,
  "http://localhost:5002"
);

export const SUPER_ADMIN_API_URL = fallback(
  process.env.REACT_APP_SUPER_ADMIN_URL,
  process.env.REACT_APP_RESTAURANT_URL,
  "http://localhost:5002"
);

export const ORDER_SERVICE_URL = fallback(
  process.env.REACT_APP_ORDER_URL,
  "http://localhost:5005"
);

export const PAYMENT_SERVICE_URL = fallback(
  process.env.REACT_APP_PAYMENT_URL,
  "http://localhost:5004"
);

export const PROMOTION_SERVICE_URL = fallback(
  process.env.REACT_APP_PROMOTION_URL,
  "http://localhost:5006"
);

export const SETTLEMENT_SERVICE_URL = fallback(
  process.env.REACT_APP_SETTLEMENT_URL,
  "http://localhost:5007"
);

export const DELIVERY_SERVICE_URL = fallback(
  process.env.REACT_APP_DELIVERY_URL,
  "http://localhost:5003"
);

export const REALTIME_SERVICE_URL = fallback(
  process.env.REACT_APP_REALTIME_URL,
  "http://localhost:5050"
);
