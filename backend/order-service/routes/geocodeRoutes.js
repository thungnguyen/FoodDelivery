import express from "express";
import Order from "../models/orderModel.js";
import { geocode } from "../utils/geocode.js";

const router = express.Router();

router.post("/orders/:id/geocode", async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: "Order not found" });
        const coords = await geocode(order.deliveryAddress);
        if (coords) {
            order.deliveryLat = coords.lat;
            order.deliveryLng = coords.lng;
            await order.save();
            return res.json({ message: "Geocoded", deliveryLat: order.deliveryLat, deliveryLng: order.deliveryLng });
        }
        return res.status(400).json({ message: "Geocode failed" });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Failed to geocode" });
    }
});

// Generic geocode endpoint for frontend (proxy to avoid CORS issues)
router.get("/geocode", async (req, res) => {
    try {
        const q = typeof req.query.address === "string" ? req.query.address.trim() : "";
        if (!q) {
            return res.status(400).json({ message: "address query is required" });
        }
        const coords = await geocode(q);
        if (!coords) {
            return res.status(404).json({ message: "Không tìm thấy tọa độ cho địa chỉ này." });
        }
        return res.json({ lat: coords.lat, lng: coords.lng, fullAddress: q });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Failed to geocode" });
    }
});

export default router;
