import Order from "../models/orderModel.js";
import emitEvent from "../utils/eventBus.js";
import buildOrderRooms from "../utils/realtimeRooms.js";

const DELIVERY_SERVICE_URL = process.env.DELIVERY_SERVICE_URL || "http://localhost:5003";

const MAX_DRONE_GAP_FACTOR = 1.1;

const haversineKm = (a, b) => {
    if (!a || !b || typeof a.lat !== "number" || typeof a.lng !== "number" || typeof b.lat !== "number" || typeof b.lng !== "number") {
        return Number.POSITIVE_INFINITY;
    }
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;

    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);

    const aHarv = sinDLat * sinDLat + sinDLon * sinDLon * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(aHarv), Math.sqrt(1 - aHarv));
    return R * c;
};

const fetchJson = async (url, options = {}) => {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };
    const response = await fetch(url, { ...options, headers });
    let data = null;
    try {
        data = await response.json();
    } catch (err) {
        data = null;
    }
    return { ok: response.ok, status: response.status, data };
};

const updateRemoteDrone = async (droneId, payload = {}) => {
    if (!droneId) return null;
    const url = `${DELIVERY_SERVICE_URL}/api/drones/${encodeURIComponent(droneId)}`;
    try {
        return await fetchJson(url, {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Failed to call delivery-service for drone update", err.message);
        return null;
    }
};

const pickNearestIdleDrone = (drones, hubId, targetLocation) => {
    if (!Array.isArray(drones) || !drones.length) return null;
    const idle = drones.filter(
        (drone) =>
            drone &&
            typeof drone === "object" &&
            (drone.status || "").toLowerCase() === "idle" &&
            (!hubId || drone.hubId === hubId)
    );
    if (!idle.length) {
        return null;
    }
    if (!targetLocation || typeof targetLocation.lat !== "number" || typeof targetLocation.lng !== "number") {
        return idle[0];
    }
    const sorted = [...idle].sort((a, b) => {
        const da = haversineKm(a.location || {}, targetLocation);
        const db = haversineKm(b.location || {}, targetLocation);
        return da - db;
    });
    return sorted[0];
};

const validateRange = ({ hub, restaurantLocation, customerLocation }) => {
    if (!hub || !hub.location || typeof hub.location.lat !== "number" || typeof hub.location.lng !== "number") {
        return { ok: true };
    }
    const radius = Number(hub.radiusKm || 0);
    if (!radius) return { ok: true };

    const hubLoc = hub.location;
    if (restaurantLocation) {
        const distHubRestaurant = haversineKm(hubLoc, restaurantLocation);
        if (distHubRestaurant > radius * MAX_DRONE_GAP_FACTOR) {
            return { ok: false, reason: "restaurant_out_of_range", distance: distHubRestaurant };
        }
    }
    if (customerLocation) {
        const distHubCustomer = haversineKm(hubLoc, customerLocation);
        if (distHubCustomer > radius * MAX_DRONE_GAP_FACTOR) {
            return { ok: false, reason: "customer_out_of_range", distance: distHubCustomer };
        }
    }
    if (restaurantLocation && customerLocation) {
        const distRoute = haversineKm(restaurantLocation, customerLocation);
        if (distRoute > radius * 2) {
            return { ok: false, reason: "route_out_of_range", distance: distRoute };
        }
    }
    return { ok: true };
};

const syncOrderDroneStatus = async ({ order, status, droneId, session }) => {
    order.status = status;
    order.droneStatus = status;
    if (droneId) {
        order.droneId = droneId;
    }
    await order.save({ session });

    const payload = {
        event: "order-status-update",
        payload: {
            orderId: order._id,
            status,
            droneId: order.droneId
        },
        rooms: buildOrderRooms({
            orderId: order._id,
            customerId: order.customerId,
            restaurantId: order.restaurantId
        })
    };
    await emitEvent(payload);
    await emitEvent({ event: status, payload: payload.payload, rooms: payload.rooms });
    await emitEvent({ event: "drone-status-update", payload: payload.payload, broadcast: true });
};

const fallbackToShipper = async (orderId) => {
    const order = await Order.findById(orderId);
    if (!order) return null;
    order.status = "Delivering";
    order.droneStatus = null;
    order.droneId = null;
    await order.save();
    await emitEvent({
        event: "order-status-update",
        payload: { orderId: order._id, status: order.status },
        rooms: buildOrderRooms({
            orderId: order._id,
            customerId: order.customerId,
            restaurantId: order.restaurantId
        })
    });
    return order;
};

export const assignDroneToOrder = async (req, res) => {
    const { orderId, hubId, restaurantLocation, customerLocation } = req.body || {};
    if (!orderId) {
        return res.status(400).json({ message: "orderId is required" });
    }

    const { data: droneResponse } = await fetchJson(`${DELIVERY_SERVICE_URL}/api/drones`);
    const droneList = Array.isArray(droneResponse?.data) ? droneResponse.data : droneResponse || [];

    let targetLocation =
        restaurantLocation && typeof restaurantLocation.lat === "number" && typeof restaurantLocation.lng === "number"
            ? restaurantLocation
            : null;
    let hub = null;
    if (hubId) {
        const { data: hubResponse } = await fetchJson(`${DELIVERY_SERVICE_URL}/api/hubs/${hubId}`);
        hub = hubResponse?.data || hubResponse;
        if (!targetLocation && hub && typeof hub.location?.lat === "number" && typeof hub.location?.lng === "number") {
            targetLocation = hub.location;
        }
    }

    const rangeCheck = validateRange({ hub, restaurantLocation, customerLocation });
    if (!rangeCheck.ok) {
        const fallback = await fallbackToShipper(orderId);
        return res.status(400).json({
            message: "Drone route out of range; fallback to shipper",
            reason: rangeCheck.reason,
            distance: rangeCheck.distance,
            fallback: Boolean(fallback)
        });
    }

    const picked = pickNearestIdleDrone(droneList, hubId, targetLocation);
    if (!picked) {
        const fallback = await fallbackToShipper(orderId);
        return res.status(404).json({ message: "No idle drone available", fallback: Boolean(fallback) });
    }

    const session = await Order.startSession();
    let order;

    try {
        await session.withTransaction(async () => {
            order = await Order.findById(orderId).session(session);
            if (!order) {
                const err = new Error("Order not found");
                err.statusCode = 404;
                throw err;
            }

            order.droneId = picked.droneId || picked.id || picked._id;
            order.droneHubId = hubId || picked.hubId || order.droneHubId;
            await syncOrderDroneStatus({ order, status: "drone_assigned", droneId: order.droneId, session });
        });
    } catch (error) {
        await session.endSession();
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ message: error.message || "Failed to assign drone" });
    }
    await session.endSession();

    await updateRemoteDrone(picked.droneId || picked.id || picked._id, {
        status: "assigned",
        currentOrderId: orderId,
        hubId: hubId || picked.hubId
    });

    return res.status(200).json({
        message: "Drone assigned",
        data: {
            orderId: order._id,
            droneId: order.droneId,
            status: "drone_assigned"
        }
    });
};

export const droneArrivedRestaurant = async (req, res) => {
    const { orderId, droneId } = req.body || {};
    if (!orderId || !droneId) {
        return res.status(400).json({ message: "orderId and droneId are required" });
    }

    const session = await Order.startSession();
    try {
        await session.withTransaction(async () => {
            const order = await Order.findById(orderId).session(session);
            if (!order) {
                const err = new Error("Order not found");
                err.statusCode = 404;
                throw err;
            }
            await syncOrderDroneStatus({
                order,
                status: "drone_arrived_restaurant",
                droneId,
                session
            });
        });
    } catch (error) {
        await session.endSession();
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ message: error.message || "Failed to update order" });
    }
    await session.endSession();

    await updateRemoteDrone(droneId, { status: "picking", currentOrderId: orderId });
    return res.json({ message: "Drone arrival recorded" });
};

export const dronePickupOrder = async (req, res) => {
    const { orderId, droneId } = req.body || {};
    if (!orderId || !droneId) {
        return res.status(400).json({ message: "orderId and droneId are required" });
    }

    const session = await Order.startSession();
    try {
        await session.withTransaction(async () => {
            const order = await Order.findById(orderId).session(session);
            if (!order) {
                const err = new Error("Order not found");
                err.statusCode = 404;
                throw err;
            }
            await syncOrderDroneStatus({
                order,
                status: "drone_picked_food",
                droneId,
                session
            });
        });
    } catch (error) {
        await session.endSession();
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ message: error.message || "Failed to update order" });
    }
    await session.endSession();

    await updateRemoteDrone(droneId, { status: "delivering", currentOrderId: orderId });
    return res.json({ message: "Drone pickup recorded" });
};

export const droneArrivedCustomer = async (req, res) => {
    const { orderId, droneId } = req.body || {};
    if (!orderId || !droneId) {
        return res.status(400).json({ message: "orderId and droneId are required" });
    }

    const session = await Order.startSession();
    try {
        await session.withTransaction(async () => {
            const order = await Order.findById(orderId).session(session);
            if (!order) {
                const err = new Error("Order not found");
                err.statusCode = 404;
                throw err;
            }
            await syncOrderDroneStatus({
                order,
                status: "drone_arrived_customer",
                droneId,
                session
            });
        });
    } catch (error) {
        await session.endSession();
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ message: error.message || "Failed to update order" });
    }
    await session.endSession();

    await updateRemoteDrone(droneId, { status: "returning", currentOrderId: orderId });
    return res.json({ message: "Drone arrived at customer" });
};

export const droneReturnToHub = async (req, res) => {
    const { droneId, orderId } = req.body || {};
    if (!droneId) {
        return res.status(400).json({ message: "droneId is required" });
    }

    if (orderId) {
        const order = await Order.findById(orderId);
        if (order) {
            order.droneStatus = "drone_arrived_customer";
            await order.save();
            await emitEvent({
                event: "order.drone.status",
                payload: {
                    orderId: order._id,
                    status: order.droneStatus,
                    droneId
                },
                rooms: buildOrderRooms({
                    orderId: order._id,
                    customerId: order.customerId,
                    restaurantId: order.restaurantId
                })
            });
        }
    }

    await updateRemoteDrone(droneId, { status: "idle", currentOrderId: null });
    return res.json({ message: "Drone returned to hub" });
};

export const forceReturnDrone = async (req, res) => {
    const { orderId, droneId } = req.body || {};
    if (!droneId) {
        return res.status(400).json({ message: "droneId is required" });
    }
    if (orderId) {
        await fallbackToShipper(orderId);
    }
    await updateRemoteDrone(droneId, { status: "returning", currentOrderId: null });
    await emitEvent({ event: "drone-status-update", payload: { droneId, status: "returning" }, broadcast: true });
    return res.json({ message: "Drone forced to return" });
};

export const cancelDroneDelivery = async (req, res) => {
    const { orderId } = req.body || {};
    if (!orderId) {
        return res.status(400).json({ message: "orderId is required" });
    }
    const order = await fallbackToShipper(orderId);
    if (!order) {
        return res.status(404).json({ message: "Order not found" });
    }
    await emitEvent({
        event: "drone_delivery_cancelled",
        payload: { orderId: order._id, status: order.status },
        rooms: buildOrderRooms({ orderId: order._id, customerId: order.customerId, restaurantId: order.restaurantId })
    });
    return res.json({ message: "Drone delivery cancelled; fallback to shipper", data: { orderId: order._id, status: order.status } });
};
