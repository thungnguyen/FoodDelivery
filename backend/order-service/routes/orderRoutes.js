import express from "express";
import {
    createOrder,
    getOrders,
    getOrderById,
    updateOrderStatus,
    cancelOrder,
    updateOrderDetails,
    submitOrderFeedback,
    getRestaurantProductReviews
} from "../controllers/orderController.js";

import { protect, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Only customers can place orders
router.post("/", protect, authorizeRoles("customer"), createOrder);

// Customers, restaurants, drivers and admins can view orders (scoped in controller)
router.get("/", protect, authorizeRoles("customer", "restaurant", "driver", "admin", "superAdmin"), getOrders);
router.get(
    "/feedback/restaurant",
    protect,
    authorizeRoles("restaurant", "admin", "superAdmin"),
    getRestaurantProductReviews
);
router.get("/:id", protect, authorizeRoles("customer", "restaurant", "driver", "admin", "superAdmin"), getOrderById);

// Customers can adjust their order details before confirmation, admins/restaurants may also edit via same endpoint
router.patch("/:id", protect, authorizeRoles("customer", "restaurant", "admin", "superAdmin"), updateOrderDetails);

// Restaurant, driver and admin-specific status transitions
router.patch("/:id/status", protect, authorizeRoles("restaurant", "driver", "admin", "superAdmin"), updateOrderStatus);

// Customers can rate their experience after completion
router.post("/:id/feedback", protect, authorizeRoles("customer"), submitOrderFeedback);

// Customers, restaurants and admins can cancel subject to status checks
router.delete("/:id", protect, authorizeRoles("customer", "restaurant", "admin", "superAdmin"), cancelOrder);

export default router;
