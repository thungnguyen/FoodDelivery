export const DEFAULT_SHIPPING_FEE = 15000;

export const computeShippingFee = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }
  return DEFAULT_SHIPPING_FEE;
};

export const roundCurrency = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.round(num * 100) / 100;
};
