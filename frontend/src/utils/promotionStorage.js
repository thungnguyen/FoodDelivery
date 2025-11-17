const STORAGE_KEY = "customerSavedPromotions";
const EVENT_NAME = "customer-promotions-updated";

const safeParse = (raw) => {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const emitChange = (payload) => {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
};

const persist = (list) => {
  if (typeof window === "undefined") {
    return list;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  emitChange(list);
  return list;
};

export const getSavedPromotions = () => {
  if (typeof window === "undefined") {
    return [];
  }
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
};

export const savePromotion = (promotion, context = {}) => {
  if (!promotion || !promotion.code) {
    return getSavedPromotions();
  }
  const normalizedCode = promotion.code.trim().toUpperCase();
  const existing = getSavedPromotions().filter(
    (item) => item.code && item.code.toUpperCase() !== normalizedCode
  );
  const enriched = {
    ...promotion,
    code: normalizedCode,
    restaurantId: promotion.restaurantId || context.restaurantId || null,
    restaurantName: promotion.restaurantName || context.restaurantName || "",
    savedAt: new Date().toISOString(),
  };
  return persist([enriched, ...existing]);
};

export const removeSavedPromotion = (code) => {
  if (!code) {
    return getSavedPromotions();
  }
  const normalizedCode = code.trim().toUpperCase();
  const filtered = getSavedPromotions().filter(
    (item) => (item.code || "").toUpperCase() !== normalizedCode
  );
  return persist(filtered);
};

export const clearSavedPromotions = () => persist([]);

export const subscribePromotionChanges = (callback) => {
  if (typeof window === "undefined" || typeof callback !== "function") {
    return () => {};
  }
  const handler = (event) => {
    const detail = Array.isArray(event?.detail) ? event.detail : getSavedPromotions();
    callback(detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
