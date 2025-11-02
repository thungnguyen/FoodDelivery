import express from "express";
import {
    getLedgerEntries,
    getRestaurantWalletSummary,
    listNegativeRestaurantBalances
} from "../controllers/financeController.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
    "/restaurants/:restaurantId/wallet",
    protect,
    authorizeRoles("restaurant", "admin", "superAdmin"),
    getRestaurantWalletSummary
);

router.get(
    "/ledger",
    protect,
    authorizeRoles("restaurant", "admin", "superAdmin"),
    getLedgerEntries
);

router.get(
    "/debtors",
    protect,
    authorizeRoles("admin", "superAdmin"),
    listNegativeRestaurantBalances
);

export default router;
