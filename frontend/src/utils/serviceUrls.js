// Centralized service endpoints so the UI can switch environments without touching component code
const fallback = (value, def) => (value && value.trim().length ? value : def);

export const AUTH_SERVICE_URL = fallback(
  process.env.REACT_APP_AUTH_URL || process.env.REACT_APP_BACKEND_URL,
  "http://localhost:4000"
);

export const RESTAURANT_SERVICE_URL = fallback(
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

export const DELIVERY_SERVICE_URL = fallback(
  process.env.REACT_APP_DELIVERY_URL,
  "http://localhost:5003"
);

