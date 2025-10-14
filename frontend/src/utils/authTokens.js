// Centralized helpers for storing authentication tokens per role
const AUTH_TOKEN_KEYS = Object.freeze({
  customer: "customerToken",
  restaurant: "restaurantToken",
  superAdmin: "superAdminToken",
  driver: "driverToken",
});

const LEGACY_TOKEN_KEY = "token";

export const AUTH_ROLES = Object.freeze({
  CUSTOMER: "customer",
  RESTAURANT: "restaurant",
  SUPER_ADMIN: "superAdmin",
  DRIVER: "driver",
});

const resolveKey = (role) => AUTH_TOKEN_KEYS[role] || null;

export const getAuthToken = (role) => {
  const key = resolveKey(role);
  if (!key) return null;
  const value = localStorage.getItem(key);
  if (value) return value;

  // Backward compatibility: fall back to legacy key if present
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  return legacy || null;
};

export const setAuthToken = (role, token) => {
  const key = resolveKey(role);
  if (!key) return;
  if (token) {
    localStorage.setItem(key, token);
  } else {
    localStorage.removeItem(key);
  }
  // Cleanup legacy slot to avoid collisions across roles
  localStorage.removeItem(LEGACY_TOKEN_KEY);
};

export const clearAuthToken = (role) => {
  setAuthToken(role, null);
};

export const isRoleLoggedIn = (role) => !!getAuthToken(role);

export { AUTH_TOKEN_KEYS };
