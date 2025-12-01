import express from "express";
import {
    createOrder,
    getOrders,
    getOrderById,
    getDroneOrdersQueue,
    updateOrderStatus,
    cancelOrder,
    updateOrderDetails,
    submitOrderFeedback,
    getRestaurantProductReviews,
    markOrderAsReceived
} from "../controllers/orderController.js";

import { protect, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Only customers can place orders
router.post("/", protect, authorizeRoles("customer"), createOrder);

// Public endpoint for drone center queue (no auth)
router.get("/drone/orders-queue", getDroneOrdersQueue);

// Customers, restaurants and admins can view orders (scoped in controller)
router.get("/", protect, authorizeRoles("customer", "restaurant", "admin", "superAdmin"), getOrders);
router.get(
    "/feedback/restaurant",
    protect,
    authorizeRoles("customer", "restaurant", "admin", "superAdmin"),
    getRestaurantProductReviews
);
router.get("/:id", protect, authorizeRoles("customer", "restaurant", "admin", "superAdmin"), getOrderById);

// Customers can adjust their order details before confirmation, admins/restaurants may also edit via same endpoint
router.patch("/:id", protect, authorizeRoles("customer", "restaurant", "admin", "superAdmin"), updateOrderDetails);

// Restaurant and admin-specific status transitions
router.patch("/:id/status", protect, authorizeRoles("restaurant", "admin", "superAdmin"), updateOrderStatus);

// Customers confirm delivery to complete the order
router.patch("/:id/received", protect, authorizeRoles("customer"), markOrderAsReceived);

// Customers can rate their experience after completion
router.post("/:id/feedback", protect, authorizeRoles("customer"), submitOrderFeedback);

// Customers, restaurants and admins can cancel subject to status checks
router.delete("/:id", protect, authorizeRoles("customer", "restaurant", "admin", "superAdmin"), cancelOrder);

export default router;
