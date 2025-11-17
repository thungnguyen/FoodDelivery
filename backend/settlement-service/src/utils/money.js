export const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
};

export const roundCurrency = (value) => {
  const numeric = toNumber(value, 0);
  return Math.round(numeric * 100) / 100;
};

export const clampPositive = (value) => {
  return Math.max(0, roundCurrency(value));
};
