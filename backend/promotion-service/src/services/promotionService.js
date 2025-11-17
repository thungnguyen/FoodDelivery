import Promotion from "../models/Promotion.js";

const normalizeCode = (value) => {
  if (!value || typeof value !== "string") {
    return "";
  }
  return value.trim().toUpperCase();
};

const roundCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
};

const resolveStatus = (promotion) => {
  if (!promotion) return "INACTIVE";
  const now = new Date();
  const start = promotion.startDate ? new Date(promotion.startDate) : null;
  const end = promotion.endDate ? new Date(promotion.endDate) : null;
  const limitReached =
    typeof promotion.usageLimit === "number" && promotion.usageLimit > 0
      ? promotion.usedCount >= promotion.usageLimit
      : false;

  if (promotion.status === "INACTIVE") {
    return "INACTIVE";
  }
  if (limitReached || (end && now > end)) {
    return "EXPIRED";
  }
  if (start && now < start) {
    return "SCHEDULED";
  }
  return "ACTIVE";
};

const isWithinSchedule = (promotion) => {
  const status = resolveStatus(promotion);
  if (status === "EXPIRED" || status === "INACTIVE") {
    return false;
  }
  if (status === "SCHEDULED") {
    return false;
  }
  return true;
};

const matchesRestaurant = (promotion, restaurantId) => {
  if (!promotion.restaurantId) {
    return true;
  }
  if (!restaurantId) {
    return false;
  }
  return promotion.restaurantId.toString() === restaurantId.toString();
};

const calculateDiscount = (promotion, orderTotal) => {
  const total = roundCurrency(orderTotal);
  if (!promotion || !total || total <= 0) {
    return 0;
  }
  const base = promotion.type === "FIXED" ? Number(promotion.value || 0) : (Number(promotion.value || 0) / 100) * total;
  let discount = roundCurrency(Math.max(0, base));
  if (typeof promotion.maxDiscount === "number" && promotion.maxDiscount > 0) {
    discount = Math.min(discount, promotion.maxDiscount);
  }
  discount = Math.min(discount, total);
  return roundCurrency(discount);
};

export const evaluatePromotion = ({ promotion, orderTotal, restaurantId }) => {
  if (!promotion) {
    return { valid: false, reason: "Mã không tồn tại." };
  }
  if (!isWithinSchedule(promotion)) {
    return { valid: false, reason: "Mã đã hết hạn hoặc chưa mở." };
  }
  if (promotion.status === "PAUSED") {
    return { valid: false, reason: "Mã đang tạm dừng." };
  }
  if (!matchesRestaurant(promotion, restaurantId)) {
    return { valid: false, reason: "Mã chỉ áp dụng cho nhà hàng khác." };
  }

  const total = roundCurrency(orderTotal);
  if (typeof promotion.minOrder === "number" && promotion.minOrder > 0 && total < promotion.minOrder) {
    return { valid: false, reason: `Đơn tối thiểu ${promotion.minOrder.toLocaleString("vi-VN")}đ.` };
  }

  const discount = calculateDiscount(promotion, total);
  if (!discount) {
    return { valid: false, reason: "Mã không tạo ra ưu đãi cho đơn này." };
  }

  return {
    valid: true,
    discount,
    status: resolveStatus(promotion)
  };
};

export const getPromotionByCode = async (code) => {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return null;
  }
  const promotion = await Promotion.findOne({ code: normalized });
  return promotion;
};

export const buildPromotionResponse = (promotion, discountAmount = 0) => {
  if (!promotion) return null;
  return {
    id: promotion._id,
    code: promotion.code,
    type: promotion.type,
    value: promotion.value,
    minOrder: promotion.minOrder,
    maxDiscount: promotion.maxDiscount,
    restaurantId: promotion.restaurantId || null,
    startDate: promotion.startDate,
    endDate: promotion.endDate,
    usageLimit: promotion.usageLimit,
    usedCount: promotion.usedCount,
    status: resolveStatus(promotion),
    discountAmount: roundCurrency(discountAmount),
    description: promotion.description || "",
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt
  };
};

export const updateLifecycleStatus = async (promotion) => {
  if (!promotion) return null;
  const nextStatus = resolveStatus(promotion);
  if (nextStatus !== promotion.status) {
    promotion.status = nextStatus;
    await promotion.save();
  }
  return promotion;
};

export const normalizePromotionInput = (payload = {}) => {
  return {
    code: normalizeCode(payload.code),
    type: payload.type === "FIXED" ? "FIXED" : "PERCENT",
    value: Number(payload.value) || 0,
    minOrder: typeof payload.minOrder === "number" ? payload.minOrder : payload.minOrder ? Number(payload.minOrder) : 0,
    maxDiscount: payload.maxDiscount ? Number(payload.maxDiscount) : undefined,
    restaurantId: payload.restaurantId || null,
    startDate: payload.startDate ? new Date(payload.startDate) : null,
    endDate: payload.endDate ? new Date(payload.endDate) : null,
    usageLimit: payload.usageLimit ? Number(payload.usageLimit) : undefined,
    status: payload.status || "ACTIVE",
    description: payload.description || ""
  };
};
