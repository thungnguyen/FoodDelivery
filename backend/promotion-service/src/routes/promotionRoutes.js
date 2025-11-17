import express from "express";
import {
  applyPromotionCode,
  createPromotion,
  getAllPromotions,
  getPromotionsByRestaurant,
  validatePromotionCode
} from "../controllers/promotionController.js";

const router = express.Router();

router.post("/", createPromotion);
router.get("/", getAllPromotions);
router.get("/restaurant/:restaurantId", getPromotionsByRestaurant);
router.post("/validate", validatePromotionCode);
router.post("/apply", applyPromotionCode);

export default router;
