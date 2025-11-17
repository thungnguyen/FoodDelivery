import Promotion from "../models/Promotion.js";
import {
  buildPromotionResponse,
  evaluatePromotion,
  getPromotionByCode,
  normalizePromotionInput,
  updateLifecycleStatus
} from "../services/promotionService.js";
import { publishEvent } from "../rabbitmq.js";

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
};

const ensureDates = ({ startDate, endDate }) => {
  if (!startDate || !endDate) {
    throw new Error("startDate và endDate là bắt buộc.");
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Ngày áp dụng không hợp lệ.");
  }
  if (start >= end) {
    throw new Error("Ngày kết thúc phải sau ngày bắt đầu.");
  }
  return { start, end };
};

export const createPromotion = async (req, res) => {
  try {
    const normalized = normalizePromotionInput(req.body);
    const { start, end } = ensureDates({ startDate: normalized.startDate, endDate: normalized.endDate });

    if (!normalized.code) {
      return res.status(400).json({ message: "Vui lòng nhập mã khuyến mãi." });
    }

    const existing = await Promotion.findOne({ code: normalized.code });
    if (existing) {
      return res.status(409).json({ message: "Mã khuyến mãi đã tồn tại." });
    }

    const promotion = await Promotion.create({
      ...normalized,
      startDate: start,
      endDate: end
    });

    res.status(201).json(buildPromotionResponse(promotion));
  } catch (error) {
    console.error("[promotion-service] createPromotion error", error.message);
    res.status(400).json({ message: error.message || "Không thể tạo khuyến mãi" });
  }
};

export const getAllPromotions = async (req, res) => {
  try {
    const query = {};
    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status;
    }
    const promotions = await Promotion.find(query).sort({ createdAt: -1 });
    const response = promotions.map((promotion) => buildPromotionResponse(promotion));
    res.json(response);
  } catch (error) {
    console.error("[promotion-service] getAllPromotions error", error.message);
    res.status(500).json({ message: "Không thể tải danh sách khuyến mãi" });
  }
};

export const getPromotionsByRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const query = { $or: [{ restaurantId }, { restaurantId: null }] };

    const promotions = await Promotion.find(query).sort({ createdAt: -1 });
    const response = promotions.map((promotion) => buildPromotionResponse(promotion));
    res.json(response);
  } catch (error) {
    console.error("[promotion-service] getPromotionsByRestaurant error", error.message);
    res.status(500).json({ message: "Không thể tải khuyến mãi của nhà hàng" });
  }
};

const validatePayload = (body) => {
  const code = body.code?.toString?.().trim?.();
  if (!code) {
    return { valid: false, message: "Vui lòng nhập mã khuyến mãi" };
  }
  const orderTotal = toNumber(body.orderTotal);
  if (orderTotal <= 0) {
    return { valid: false, message: "Giá trị đơn hàng không hợp lệ" };
  }
  return { valid: true, code, orderTotal };
};

export const validatePromotionCode = async (req, res) => {
  try {
    const validation = validatePayload(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const promotion = await getPromotionByCode(validation.code);
    if (!promotion) {
      return res.status(404).json({ message: "Không tìm thấy mã khuyến mãi" });
    }

    const evaluation = evaluatePromotion({
      promotion,
      orderTotal: validation.orderTotal,
      restaurantId: req.body.restaurantId
    });

    if (!evaluation.valid) {
      return res.status(400).json({ message: evaluation.reason });
    }

    await updateLifecycleStatus(promotion);
    res.json(buildPromotionResponse(promotion, evaluation.discount));
  } catch (error) {
    console.error("[promotion-service] validatePromotionCode error", error.message);
    res.status(500).json({ message: "Không thể xác thực mã khuyến mãi" });
  }
};

export const applyPromotionCode = async (req, res) => {
  try {
    const validation = validatePayload(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const promotion = await getPromotionByCode(validation.code);
    if (!promotion) {
      return res.status(404).json({ message: "Không tìm thấy mã khuyến mãi" });
    }

    const evaluation = evaluatePromotion({
      promotion,
      orderTotal: validation.orderTotal,
      restaurantId: req.body.restaurantId
    });

    if (!evaluation.valid) {
      return res.status(400).json({ message: evaluation.reason });
    }

    const usageFilter = {};
    if (promotion.usageLimit && promotion.usageLimit > 0) {
      usageFilter.usedCount = { $lt: promotion.usageLimit };
    }

    const updatedPromotion = await Promotion.findOneAndUpdate(
      {
        _id: promotion._id,
        ...(usageFilter.usedCount ? { usedCount: { $lt: promotion.usageLimit } } : {})
      },
      { $inc: { usedCount: 1 } },
      { new: true }
    );

    if (!updatedPromotion) {
      return res.status(409).json({ message: "Mã đã hết lượt sử dụng" });
    }

    await updateLifecycleStatus(updatedPromotion);

    await publishEvent("promotion.used", {
      promotionId: promotion._id.toString(),
      code: promotion.code,
      restaurantId: promotion.restaurantId,
      orderId: req.body.orderId || null,
      userId: req.body.userId || null,
      orderTotal: validation.orderTotal,
      discountAmount: evaluation.discount,
      appliedAt: new Date().toISOString()
    });

    res.json(buildPromotionResponse(updatedPromotion, evaluation.discount));
  } catch (error) {
    console.error("[promotion-service] applyPromotionCode error", error.message);
    res.status(500).json({ message: "Không thể áp dụng mã khuyến mãi" });
  }
};
