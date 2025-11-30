import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import DroneMapCanvas from "../drone-center/components/DroneMapCanvas";
import {
  ORDER_SERVICE_URL,
  DELIVERY_SERVICE_URL,
  REALTIME_SERVICE_URL,
} from "../../utils/serviceUrls";
import { getAuthToken, AUTH_ROLES } from "../../utils/authTokens";

const extractPoint = (raw = {}) => {
  const lat = Number(raw.lat ?? raw.latitude ?? raw.deliveryLat);
  const lng = Number(raw.lng ?? raw.longitude ?? raw.deliveryLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
};

const DroneOrderMap = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [error, setError] = useState("");
  const [droneTracking, setDroneTracking] = useState({});
  const socketRef = useRef(null);
  const pollTimerRef = useRef(null);

  const customerToken = getAuthToken(AUTH_ROLES.CUSTOMER);
  const adminToken = getAuthToken(AUTH_ROLES.SUPER_ADMIN) || getAuthToken(AUTH_ROLES.ADMIN);
  const headers = useMemo(() => {
    const token = customerToken || adminToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [adminToken, customerToken]);

  const loadOrder = useCallback(async () => {
    try {
      const res = await axios.get(`${ORDER_SERVICE_URL}/api/orders/${id}`, { headers });
      const data = res.data?.data || res.data;
      setOrder(data);
      setError("");
      return data;
    } catch (err) {
      setError(err?.response?.data?.message || "Không tải được đơn hàng");
      return null;
    }
  }, [headers, id]);

  const loadRoute = useCallback(
    async (orderId, droneId) => {
      try {
        const res = await axios.post(`${DELIVERY_SERVICE_URL}/api/drone/auto-route`, { orderId, droneId });
        const waypoints = res.data?.data?.waypoints || [];
        if (waypoints.length) {
          setRoutePoints(
            waypoints.map((wp) => ({
              lat: wp.lat,
              lng: wp.lng,
              type: wp.type?.toLowerCase(),
              label: wp.type,
            }))
          );
        }
      } catch (err) {
        // silent
      }
    },
    []
  );

  const upsertTracking = useCallback((payload = {}) => {
    if (!payload.droneId) return;
    setDroneTracking((prev) => ({
      ...prev,
      [payload.droneId]: {
        ...(prev[payload.droneId] || {}),
        ...payload,
        updatedAt: payload.updatedAt || new Date().toISOString(),
      },
    }));
  }, []);

  const fetchDroneSnapshot = useCallback(
    async (droneId, orderId) => {
      if (!droneId) return;
      try {
        const res = await axios.get(`${DELIVERY_SERVICE_URL}/api/drones/${encodeURIComponent(droneId)}`);
        const drone = res.data?.data || res.data;
        if (drone?.location?.lat && drone?.location?.lng) {
          upsertTracking({
            droneId: drone.droneId || drone.code || droneId,
            lat: drone.location.lat,
            lng: drone.location.lng,
            status: drone.status,
            battery: drone.batteryLevel ?? drone.battery,
            orderId: orderId || drone.currentOrderId,
          });
        }
      } catch (_err) {
        // silent
      }
    },
    [upsertTracking]
  );

  useEffect(() => {
    loadOrder().then((data) => {
      if (data) {
        loadRoute(data._id || data.id, data.droneId);
        if (data.droneId) {
          fetchDroneSnapshot(data.droneId, data._id || data.id);
          pollTimerRef.current = setInterval(() => fetchDroneSnapshot(data.droneId, data._id || data.id), 6000);
        }
      }
    });
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchDroneSnapshot, id, loadOrder, loadRoute]);

  useEffect(() => {
    const socket = io(REALTIME_SERVICE_URL, {
      transports: ["websocket"],
      auth: headers.Authorization ? { token: headers.Authorization.replace("Bearer ", "") } : undefined,
    });
    socketRef.current = socket;
    socket.on("realtime:event", (message) => {
      if (!message || typeof message !== "object") return;
      const { event, payload } = message;
      if (!event) return;
      if (payload?.orderId && String(payload.orderId) !== String(id)) return;
      if (["drone-location-update", "drone:tracking:update", "drone-status-update"].includes(event)) {
        upsertTracking({
          droneId: payload?.droneId,
          lat: payload?.lat ?? payload?.location?.lat,
          lng: payload?.lng ?? payload?.location?.lng,
          status: payload?.status,
          battery: payload?.battery ?? payload?.batteryLevel,
          orderId: payload?.orderId ?? payload?.currentOrderId,
        });
      }
      if (event === "order_auto_route_loaded" && Array.isArray(payload?.waypoints)) {
        setRoutePoints(
          payload.waypoints.map((wp) => ({
            lat: wp.lat,
            lng: wp.lng,
            type: wp.type?.toLowerCase(),
            label: wp.type,
          }))
        );
      }
    });
    return () => {
      socket.off("realtime:event");
      socket.disconnect();
    };
  }, [headers.Authorization, id, upsertTracking]);

  const fallbackPoints = useMemo(() => {
    if (!order) return [];
    const pts = [];
    const hubPt = extractPoint(order.hubLocation || order.droneHubLocation);
    const restaurantPt = extractPoint(order.restaurantLocation || order.restaurantAddress || order.restaurant);
    const customerPt =
      extractPoint({ lat: order.deliveryLat, lng: order.deliveryLng }) ||
      extractPoint(order.deliveryLocation) ||
      extractPoint(order.customerLocation);
    if (hubPt) pts.push({ ...hubPt, type: "hub", label: "Hub" });
    if (restaurantPt) pts.push({ ...restaurantPt, type: "restaurant", label: "Restaurant" });
    if (customerPt) pts.push({ ...customerPt, type: "customer", label: "Customer" });
    return pts;
  }, [order]);

  const droneMarkers = useMemo(() => {
    if (!order || !order.droneId) return [];
    const track = droneTracking[order.droneId];
    if (track?.lat && track?.lng) {
      return [
        {
          droneId: track.droneId,
          location: { lat: track.lat, lng: track.lng },
          status: track.status,
          battery: track.battery,
        },
      ];
    }
    return [];
  }, [droneTracking, order]);

  const combinedRoute = routePoints.length ? routePoints : fallbackPoints;

  return (
    <div className="container py-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3>Drone Realtime Map</h3>
          <div className="text-muted">
            Đơn: {id} {order?.droneId ? `• Drone ${order.droneId}` : ""}
          </div>
        </div>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate(-1)}>
          ← Quay lại
        </button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!error && (
        <DroneMapCanvas
          drones={droneMarkers}
          hubs={[]}
          focusDroneId={order?.droneId}
          routePoints={combinedRoute}
          height={520}
        />
      )}
      <div className="mt-3">
        <Link to="/customer/orders" className="btn btn-link">
          ← Về danh sách đơn
        </Link>
      </div>
    </div>
  );
};

export default DroneOrderMap;
