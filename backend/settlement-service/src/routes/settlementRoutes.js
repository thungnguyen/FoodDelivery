import express from "express";
import {
  getAllSettlements,
  getSettlementsByRestaurant,
  listWallets,
  payRestaurant
} from "../controllers/settlementController.js";

const router = express.Router();

router.get("/", getAllSettlements);
router.get("/wallets", listWallets);
router.get("/restaurant/:restaurantId", getSettlementsByRestaurant);
router.post("/:settlementId/pay", payRestaurant);

export default router;
