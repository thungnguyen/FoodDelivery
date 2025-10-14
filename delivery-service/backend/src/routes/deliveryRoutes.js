import express from "express";
import {
  createDelivery,
  getDriverDeliveries,
  getDriverStats,
  getAvailableDeliveries,
  getDelivery,
  updateDeliveryStatus,
  deleteDelivery,
  getDeliveryByOrderId,
} from "../controllers/deliveryController.js";
import authMiddleware from "../middleware/authMiddleware.js";


const router = express.Router();

router.post("/create", authMiddleware, createDelivery);
router.get("/", authMiddleware, getDriverDeliveries);
router.get("/stats/summary", authMiddleware, getDriverStats);
router.get("/available", authMiddleware, getAvailableDeliveries);
router.get("/order/:orderId", authMiddleware, getDeliveryByOrderId);
router.get("/:id", authMiddleware, getDelivery);
router.put("/:id/status", authMiddleware, updateDeliveryStatus);
router.delete("/:id", authMiddleware, deleteDelivery); 

export default router;
