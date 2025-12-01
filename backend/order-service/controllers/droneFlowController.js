import Order from "../models/orderModel.js";
import emitEvent from "../utils/eventBus.js";
import buildOrderRooms from "../utils/realtimeRooms.js";
import { normalizeBaseUrl } from "../utils/url.js";

const DELIVERY_SERVICE_URL = normalizeBaseUrl(process.env.DELIVERY_SERVICE_URL, "http://localhost:5003");

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
    // Cho phép các trạng thái khác idle để demo, miễn không offline/retired.
    const allowed = new Set(["", "idle", "returning", "assigned", "picking", "drone_arriving_restaurant"]);
    const candidates = drones.filter((drone) => {
        if (!drone || typeof drone !== "object") return false;
        const status = (drone.status || "").toLowerCase();
        if (!allowed.has(status)) return false;
        if (hubId && drone.hubId && drone.hubId !== hubId) return false;
        return true;
    });
    if (!candidates.length) {
        return null;
    }
    if (!targetLocation || typeof targetLocation.lat !== "number" || typeof targetLocation.lng !== "number") {
        return candidates[0];
    }
    const sorted = [...candidates].sort((a, b) => {
        const da = haversineKm(a.location || {}, targetLocation);
        const db = haversineKm(b.location || {}, targetLocation);
        return da - db;
    });
    return sorted[0];
};

const fetchHubs = async () => {
    const url = `${DELIVERY_SERVICE_URL}/api/hubs`;
    try {
        return await fetchJson(url);
    } catch (err) {
        return { ok: false, data: [] };
    }
};

const pickNearestHubId = async (targetLocation) => {
    const { data } = await fetchHubs();
    const hubs = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    if (!hubs.length) return null;
    if (!targetLocation) return hubs[0]._id || hubs[0].id || hubs[0]._id || null;
    const ranked = [...hubs]
        .filter((hub) => typeof hub.location?.lat === "number" && typeof hub.location?.lng === "number")
        .sort((a, b) => haversineKm(a.location, targetLocation) - haversineKm(b.location, targetLocation));
    const best = ranked[0] || hubs[0];
    return best?._id?.toString?.() || best.id || best._id || null;
};

const validateRange = ({ hub, restaurantLocation, customerLocation }) => {
    // Demo: bỏ chặn bán kính để luôn cho phép tính tuyến.
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

export const assignDroneToOrderInternal = async ({
    orderId,
    hubId,
    restaurantLocation,
    customerLocation,
    droneId: preferredDroneId
} = {}) => {
    if (!orderId) {
        return { ok: false, statusCode: 400, message: "orderId is required" };
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
    } else {
        const chosenHubId = await pickNearestHubId(targetLocation || customerLocation || restaurantLocation);
        if (chosenHubId) {
            hubId = chosenHubId;
            const { data: hubResponse } = await fetchJson(`${DELIVERY_SERVICE_URL}/api/hubs/${chosenHubId}`);
            hub = hubResponse?.data || hubResponse;
            if (!targetLocation && hub?.location?.lat && hub?.location?.lng) {
                targetLocation = hub.location;
            }
        }
    }

    const rangeCheck = validateRange({ hub, restaurantLocation, customerLocation });
    if (!rangeCheck.ok) {
        return {
            ok: false,
            statusCode: 400,
            message: "Drone route out of range; order is still waiting_for_drone",
            reason: rangeCheck.reason,
            distance: rangeCheck.distance
        };
    }

    const normalizeId = (val) => (val ? val.toString().trim().toUpperCase() : "");
    let picked =
        droneList.find(
            (d) =>
                preferredDroneId &&
                normalizeId(d.droneId || d.code || d.id || d._id) === normalizeId(preferredDroneId) &&
                (!d.status || d.status.toLowerCase() === "idle")
        ) || pickNearestIdleDrone(droneList, hubId, targetLocation);
    if (!picked) {
        return {
            ok: false,
            statusCode: 404,
            message: "No idle drone available; order remains waiting_for_drone"
        };
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
            await syncOrderDroneStatus({ order, status: "drone_arriving_restaurant", droneId: order.droneId, session });
        });
    } catch (error) {
        await session.endSession();
        const statusCode = error.statusCode || 500;
        return { ok: false, statusCode, message: error.message || "Failed to assign drone" };
    }
    await session.endSession();

    await updateRemoteDrone(picked.droneId || picked.id || picked._id, {
        status: "drone_arriving_restaurant",
        currentOrderId: orderId,
        hubId: hubId || picked.hubId
    });

    return {
        ok: true,
        statusCode: 200,
        data: {
            orderId: order._id,
            droneId: order.droneId,
            status: "drone_assigned"
        }
    };
};

export const assignDroneToOrder = async (req, res) => {
    const result = await assignDroneToOrderInternal(req.body || {});
    if (!result.ok) {
        const statusCode = result.statusCode || 500;
        return res.status(statusCode).json({
            message: result.message || "Failed to assign drone",
            reason: result.reason,
            distance: result.distance
        });
    }
    return res.status(result.statusCode || 200).json({
        message: "Drone assigned",
        data: result.data
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
                status: "drone_arriving_restaurant",
                droneId,
                session
            });
            await emitEvent({
                event: "restaurant_wait_pickup",
                payload: { orderId, droneId },
                rooms: buildOrderRooms({ orderId: order._id, customerId: order.customerId, restaurantId: order.restaurantId })
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
            await emitEvent({
                event: "drone_waypoint_update",
                payload: { orderId, droneId, waypoint: "restaurant_pickup" },
                broadcast: true
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
                status: "drone_arriving_customer",
                droneId,
                session
            });
            await emitEvent({
                event: "customer_wait_confirm",
                payload: { orderId, droneId },
                rooms: buildOrderRooms({ orderId: order._id, customerId: order.customerId, restaurantId: order.restaurantId })
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
            order.droneStatus = "drone_arriving_customer";
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
    await emitEvent({
        event: "drone_route_complete",
        payload: { orderId, droneId },
        broadcast: true
    });
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
