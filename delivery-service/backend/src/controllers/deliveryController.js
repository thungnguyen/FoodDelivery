import axios from "axios";
import Delivery from "../models/Delivery.js";
import { geocodeAddress } from "../utils/geocode.js";
import {
  haversineDistanceKm,
  calculateEarnings,
} from "../utils/distance.js";
import {
  updateOrderStatus,
  fetchAwaitingOrders,
} from "../utils/orderServiceClient.js";

const STATUS_TRANSITIONS = {
  assigned: ["accepted", "cancelled"],
  accepted: ["picked_up", "cancelled"],
  picked_up: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "failed"],
  delivered: [],
  failed: [],
  cancelled: [],
};

const ORDER_STATUS_MAPPING = {
  accepted: "Awaiting Driver",
  picked_up: "Out for Delivery",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

const TERMINAL_STATUSES = new Set(["delivered", "failed", "cancelled"]);

const appendHistory = (delivery, status, note) => {
  delivery.statusHistory.push({
    status,
    note,
    timestamp: new Date(),
  });
};

const buildStats = (deliveries) => {
  const stats = {
    totalDeliveries: deliveries.length,
    activeDeliveries: 0,
    delivered: 0,
    failed: 0,
    cancelled: 0,
    totalEarnings: 0,
    earningsToday: 0,
  };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  deliveries.forEach((delivery) => {
    if (!TERMINAL_STATUSES.has(delivery.status)) {
      stats.activeDeliveries += 1;
    }

    if (delivery.status === "delivered") {
      stats.delivered += 1;
    }
    if (delivery.status === "failed") {
      stats.failed += 1;
    }
    if (delivery.status === "cancelled") {
      stats.cancelled += 1;
    }

    if (delivery.status === "delivered") {
      const earnings =
        Number(delivery.totalEarnings || 0) + Number(delivery.tipAmount || 0);
      stats.totalEarnings += earnings;

      if (delivery.updatedAt && new Date(delivery.updatedAt) >= startOfToday) {
        stats.earningsToday += earnings;
      }
    }
  });

  stats.totalEarnings = Math.round(stats.totalEarnings);
  stats.earningsToday = Math.round(stats.earningsToday);
  return stats;
};

export const createDelivery = async (req, res) => {
  try {
    const {
      orderId,
      customerId,
      restaurantId,
      restaurantName,
      pickupAddress,
      deliveryAddress,
    } = req.body;
    const driverId = req.driver;

    if (!orderId || !customerId || !deliveryAddress) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    let pickupAddressResolved = pickupAddress;

    if (!pickupAddressResolved && restaurantId) {
      try {
        const restaurantServiceUrl =
          process.env.RESTAURANT_SERVICE_URL ||
          "http://localhost:5002/api/restaurants";
        const restaurantResponse = await axios.get(
          `${restaurantServiceUrl}/${restaurantId}`
        );
        pickupAddressResolved =
          restaurantResponse.data?.location ||
          restaurantResponse.data?.address ||
          restaurantResponse.data?.name;
      } catch (error) {
        console.warn("Unable to resolve restaurant address", error.message);
      }
    }

    if (!pickupAddressResolved && restaurantName) {
      pickupAddressResolved = restaurantName;
    }

    if (!pickupAddressResolved) {
      return res.status(400).json({
        success: false,
        message:
          "Pickup address could not be determined for this order. Please retry later.",
      });
    }

    const existing = await Delivery.findOne({
      orderId,
      status: { $nin: ["failed", "cancelled"] },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Delivery already exists for this order",
        deliveryId: existing._id,
      });
    }

    const pickupCoords = await geocodeAddress(pickupAddressResolved);
    const deliveryCoords = await geocodeAddress(deliveryAddress);
    const pickupPoint = { type: "Point", coordinates: pickupCoords };
    const deliveryPoint = { type: "Point", coordinates: deliveryCoords };
    const creationTimestamp = new Date();
    const initialStatus = "out_for_delivery";
    const statusHistory = [
      {
        status: "assigned",
        timestamp: creationTimestamp,
        note: "Delivery created and awaiting acceptance",
      },
      {
        status: initialStatus,
        timestamp: creationTimestamp,
        note: "Driver accepted the job and is en route",
      },
    ];

    const distanceKm = haversineDistanceKm(pickupPoint, deliveryPoint);
    const earningsEstimate = calculateEarnings({
      distanceKm,
      createdAt: creationTimestamp,
    });
    const orderTotal = Number(req.body.orderTotal || 0);
    const estimatedPayoutInput = Number(req.body.estimatedPayout || 0);
    const estimatedPayout =
      estimatedPayoutInput > 0
        ? Math.max(estimatedPayoutInput, earningsEstimate.totalEarnings)
        : earningsEstimate.totalEarnings;

    const delivery = await Delivery.create({
      driver: driverId,
      orderId,
      customerId,
      customerName: req.body.customerName || "",
      customerPhone: req.body.customerPhone || "",
      restaurantId: restaurantId || "",
      restaurantName: restaurantName || "",
      pickupAddressString: pickupAddressResolved,
      pickupLocation: pickupPoint,
      deliveryAddressString: deliveryAddress,
      deliveryLocation: deliveryPoint,
      orderTotal,
      estimatedPayout,
      distanceKm,
      baseFare: earningsEstimate.baseFare,
      distanceFare: earningsEstimate.distanceFare,
      bonus: earningsEstimate.bonus,
      totalEarnings: estimatedPayout,
      status: initialStatus,
      statusHistory,
    });

    try {
      await updateOrderStatus(orderId, driverId, "Out for Delivery");
    } catch (syncError) {
      console.warn(
        `⚠️ Unable to sync order ${orderId} status after acceptance:`,
        syncError.message
      );
    }

    return res.status(201).json({
      success: true,
      message: "Delivery created successfully!",
      delivery,
    });
  } catch (error) {
    console.error("🚨 Create delivery error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDriverDeliveries = async (req, res) => {
  try {
    const driverId = req.driver;
    const deliveries = await Delivery.find({ driver: driverId }).sort({
      createdAt: -1,
    });
    const stats = buildStats(deliveries);
    res.status(200).json({ success: true, deliveries, stats });
  } catch (error) {
    console.error("🚨 Get deliveries error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch deliveries" });
  }
};

export const getDriverStats = async (req, res) => {
  try {
    const driverId = req.driver;
    const deliveries = await Delivery.find({ driver: driverId });
    const stats = buildStats(deliveries);
    res.status(200).json({ success: true, stats });
  } catch (error) {
    console.error("🚨 Get stats error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to compute stats" });
  }
};

export const getAvailableDeliveries = async (req, res) => {
  try {
    const driverId = req.driver;
    const awaitingOrders = await fetchAwaitingOrders(driverId);
    if (!awaitingOrders.length) {
      return res
        .status(200)
        .json({ success: true, deliveries: [], total: 0 });
    }

    const existingAssignments = await Delivery.find(
      {
        orderId: { $in: awaitingOrders.map((order) => order._id || order.id) },
        status: { $nin: ["failed", "cancelled"] },
      },
      "orderId status"
    ).lean();

    const busyOrderIds = new Set(
      existingAssignments
        .filter((delivery) => delivery.status !== "assigned")
        .map((delivery) => delivery.orderId)
    );

      const available = awaitingOrders.filter((order) => {
        const id = order._id || order.id;
        return id && !busyOrderIds.has(id);
      });

      const restaurantIds = Array.from(
        new Set(
          available
            .map((order) => order.restaurantId)
            .filter((value) => typeof value === "string" && value.length)
        )
      );

      const restaurantServiceUrl =
        process.env.RESTAURANT_SERVICE_URL ||
        "http://localhost:5002/api/restaurants";

      const restaurantMap = {};
      await Promise.all(
        restaurantIds.map(async (id) => {
          try {
            const response = await axios.get(`${restaurantServiceUrl}/${id}`);
            if (response.data) {
              restaurantMap[id] = response.data;
            }
          } catch (error) {
            console.warn(`Unable to fetch restaurant ${id}`, error.message);
          }
        })
      );

      const enriched = available.map((order) => {
        const restaurant = order.restaurantId
          ? restaurantMap[order.restaurantId]
          : null;
        const totalPrice = Number(order.totalPrice || 0);
        const estimatedPayout = Math.max(
          15000,
          Math.round(totalPrice * 0.12)
        );
        return {
          id: order._id || order.id,
          orderId: order._id || order.id,
          customerId: order.customerId,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          deliveryAddress: order.deliveryAddress,
          restaurantId: order.restaurantId,
          restaurantName: restaurant?.name || order.restaurantName,
          restaurantLocation: restaurant?.location || null,
          totalPrice: order.totalPrice,
          paymentMethod: order.paymentMethod,
          status: order.status,
          createdAt: order.createdAt,
          estimatedPayout,
        };
      });

      res.status(200).json({
        success: true,
        deliveries: enriched,
        total: enriched.length,
      });
    } catch (error) {
      console.error("🚨 Get available deliveries error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch available jobs" });
  }
};

export const getDelivery = async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery not found" });
    }

    res.json({
      success: true,
      delivery,
    });
  } catch (error) {
    console.error("🚨 Get delivery error:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "Internal Server Error" });
  }
};

export const updateDeliveryStatus = async (req, res) => {
  try {
    const { status, tipAmount, note, failureReason } = req.body;
    const deliveryId = req.params.id;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "Status is required" });
    }

    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery not found" });
    }

    if (TERMINAL_STATUSES.has(delivery.status)) {
      return res.status(400).json({
        success: false,
        message: "Delivery already completed and cannot be updated",
      });
    }

    const allowedNextStatuses = STATUS_TRANSITIONS[delivery.status] || [];
    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid transition from '${delivery.status}' to '${status}'`,
      });
    }

    if (status === "failed" && !failureReason) {
      return res.status(400).json({
        success: false,
        message: "Failure reason is required when marking delivery as failed",
      });
    }

    delivery.status = status;
    if (status === "failed") {
      delivery.failureReason = failureReason || "";
    }
    if (typeof tipAmount !== "undefined") {
      const tipValue = Number(tipAmount);
      if (!Number.isNaN(tipValue) && tipValue >= 0) {
        delivery.tipAmount = tipValue;
      }
    }

    appendHistory(delivery, status, note);

    let deliveredAt;
    if (status === "delivered") {
      deliveredAt = new Date();
      const distanceKm = haversineDistanceKm(
        delivery.pickupLocation,
        delivery.deliveryLocation
      );
      const earnings = calculateEarnings({
        distanceKm,
        createdAt: delivery.createdAt,
        deliveredAt,
      });

      delivery.distanceKm = distanceKm;
      delivery.baseFare = earnings.baseFare;
      delivery.distanceFare = earnings.distanceFare;
      delivery.bonus = earnings.bonus;
      delivery.estimatedPayout = earnings.totalEarnings;
      delivery.totalEarnings =
        earnings.totalEarnings + Number(delivery.tipAmount || 0);
    }

    await delivery.save();

    if (ORDER_STATUS_MAPPING[status]) {
      await updateOrderStatus(
        delivery.orderId,
        req.driver,
        ORDER_STATUS_MAPPING[status]
      );
    }

    res.json({
      success: true,
      message: `Delivery status updated to '${status}'`,
      delivery,
    });
  } catch (error) {
    console.error("🚨 Update delivery status error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update delivery status" });
  }
};

export const getDeliveryByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;
    const delivery = await Delivery.findOne({ orderId });

    if (!delivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery not found by order ID" });
    }

    res.json({
      success: true,
      delivery,
    });
  } catch (error) {
    console.error("🚨 Get delivery by order ID error:", error);
    res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export const deleteDelivery = async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);

    if (!delivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery not found" });
    }

    if (delivery.status !== "delivered" && delivery.status !== "failed") {
      return res.status(400).json({
        success: false,
        message: "Only completed deliveries can be deleted",
      });
    }

    await Delivery.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Delivery deleted successfully",
    });
  } catch (error) {
    console.error("🚨 Delete delivery error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete delivery" });
  }
};
