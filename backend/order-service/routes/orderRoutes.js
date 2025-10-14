import express from "express";
import {
    createOrder,
    getOrders,
    getOrderById,
    updateOrderStatus,
    cancelOrder,
    updateOrderDetails
} from "../controllers/orderController.js";

import { protect, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Only customers can place orders
router.post("/", protect, authorizeRoles("customer"), createOrder);

// Customers, restaurants, drivers and admins can view orders (scoped in controller)
router.get("/", protect, authorizeRoles("customer", "restaurant", "driver", "admin"), getOrders);
router.get("/:id", protect, authorizeRoles("customer", "restaurant", "driver", "admin"), getOrderById);

// Customers can adjust their order details before confirmation, admins/restaurants may also edit via same endpoint
router.patch("/:id", protect, authorizeRoles("customer", "restaurant", "admin"), updateOrderDetails);

// Restaurant, driver and admin-specific status transitions
router.patch("/:id/status", protect, authorizeRoles("restaurant", "driver", "admin"), updateOrderStatus);

// Customers, restaurants and admins can cancel subject to status checks
router.delete("/:id", protect, authorizeRoles("customer", "restaurant", "admin"), cancelOrder);

export default router;
