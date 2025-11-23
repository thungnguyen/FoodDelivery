import express from "express";
import {
  getAllSettlements,
  getSettlementsByRestaurant,
  listWallets,
  payRestaurant,
  confirmRestaurantReceipt
} from "../controllers/settlementController.js";

const router = express.Router();

router.get("/", getAllSettlements);
router.get("/wallets", listWallets);
router.get("/restaurant/:restaurantId", getSettlementsByRestaurant);
router.post("/:settlementId/pay", payRestaurant);
router.post("/:settlementId/confirm", confirmRestaurantReceipt);

export default router;
