const DRIVER_TOKEN_KEY = "delivery.driver.token";
const DRIVER_ID_KEY = "delivery.driver.id";
const DRIVER_PROFILE_KEY = "delivery.driver.profile";

export const getDriverToken = () => localStorage.getItem(DRIVER_TOKEN_KEY);

export const getDriverId = () => localStorage.getItem(DRIVER_ID_KEY);

export const setDriverSession = ({ token, driver }) => {
  if (token) {
    localStorage.setItem(DRIVER_TOKEN_KEY, token);
  }
  if (driver?.id) {
    localStorage.setItem(DRIVER_ID_KEY, driver.id);
  }
  if (driver) {
    localStorage.setItem(DRIVER_PROFILE_KEY, JSON.stringify(driver));
  }
};

export const clearDriverSession = () => {
  localStorage.removeItem(DRIVER_TOKEN_KEY);
  localStorage.removeItem(DRIVER_ID_KEY);
  localStorage.removeItem(DRIVER_PROFILE_KEY);
};

export const getStoredDriverProfile = () => {
  try {
    const raw = localStorage.getItem(DRIVER_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Failed to parse cached driver profile", error);
    return null;
  }
};
