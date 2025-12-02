import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  ORDER_SERVICE_URL,
  RESTAURANT_SERVICE_URL,
  AUTH_SERVICE_URL,
  REALTIME_SERVICE_URL,
  DELIVERY_SERVICE_URL,
} from "../../utils/serviceUrls";
import { Link, useNavigate } from "react-router-dom";
import { Button, Spinner, Badge, Form, Toast, ToastContainer } from "react-bootstrap";
import { getAuthToken, AUTH_ROLES } from "../../utils/authTokens";
import { io } from "socket.io-client";
import { BsStar, BsStarFill } from "react-icons/bs";
import { computeShippingFee, roundCurrency } from "../../utils/pricing";
import CustomerLayout from "../../components/customer/CustomerLayout";
import DroneMapCanvas from "../drone-center/components/DroneMapCanvas";

const formatCurrency = (value) => {
  if (typeof value !== "number") return "0 VND";
  return `${value.toLocaleString("vi-VN")} VND`;
};

const DRONE_STAGE_LABELS = {
  waiting_for_drone: "Chờ gán drone",
  drone_assigned: "Drone đang rời hub",
  drone_enroute_to_restaurant: "Đang tới nhà hàng",
  drone_arrived_restaurant: "Drone đã tới, chờ nhà hàng",
  drone_picked_food: "Đang giao cho khách",
  drone_delivering: "Đang giao cho khách",
  drone_arriving_customer: "Drone đang tới điểm giao",
  drone_arrived_customer: "Đã tới điểm giao, chờ xác nhận",
  customer_wait_confirm: "Drone đã tới, chờ bạn xác nhận",
};

const mapDroneStage = (status = "") => {
  const normalized = status.toLowerCase();
  if (normalized === "waiting_for_drone") return DRONE_STAGE_LABELS.waiting_for_drone;
  if (normalized === "drone_assigned") return DRONE_STAGE_LABELS.drone_assigned;
  if (normalized === "drone_enroute_to_restaurant") return DRONE_STAGE_LABELS.drone_enroute_to_restaurant;
  if (normalized === "drone_arrived_restaurant") return DRONE_STAGE_LABELS.drone_arrived_restaurant;
  if (normalized === "drone_picked_food") return DRONE_STAGE_LABELS.drone_picked_food;
  if (normalized === "drone_delivering") return DRONE_STAGE_LABELS.drone_delivering;
  if (normalized === "drone_arriving_customer") return DRONE_STAGE_LABELS.drone_arriving_customer;
  if (normalized === "drone_arrived_customer") return DRONE_STAGE_LABELS.drone_arrived_customer;
  if (normalized === "customer_wait_confirm") return DRONE_STAGE_LABELS.customer_wait_confirm;
  return "";
};

const extractPoint = (raw = {}) => {
  const lat = Number(raw.lat ?? raw.latitude ?? raw.deliveryLat);
  const lng = Number(raw.lng ?? raw.longitude ?? raw.deliveryLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
};

const DRONE_SPEED_KMH = 30;
const TO_RESTAURANT_STATUSES = new Set(['drone_assigned', 'drone_enroute_to_restaurant', 'drone_arriving_restaurant']);
const TO_CUSTOMER_STATUSES = new Set(['drone_picked_food', 'drone_delivering', 'drone_arriving_customer']);

const haversineKm = (a, b) => {
  if (!a || !b) return Infinity;
  const lat1 = Number(a.lat);
  const lat2 = Number(b.lat);
  const lng1 = Number(a.lng);
  const lng2 = Number(b.lng);
  if (![lat1, lat2, lng1, lng2].every(Number.isFinite)) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(toRad(lat1)) * Math.cos(toRad(lat2));
  return 2 * 6371 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const computeFlightEta = (order, tracking) => {
  const lat = Number(tracking?.lat);
  const lng = Number(tracking?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const status = (order?.droneStatus || order?.status || '').toLowerCase();
  let target = null;
  let legLabel = '';

  if (TO_RESTAURANT_STATUSES.has(status)) {
    target = extractPoint(order.restaurantLocation || order.restaurantAddress || order.restaurant);
    legLabel = 'tới nhà hàng';
  } else if (TO_CUSTOMER_STATUSES.has(status)) {
    target =
      extractPoint({ lat: order.deliveryLat, lng: order.deliveryLng }) ||
      extractPoint(order.deliveryLocation) ||
      extractPoint(order.customerLocation);
    legLabel = 'tới khách hàng';
  } else {
    return null;
  }

  if (!target) return null;
  const distanceKm = haversineKm({ lat, lng }, target);
  if (!Number.isFinite(distanceKm) || distanceKm === Infinity) return null;
  const etaSeconds = Math.max(0, Math.round((distanceKm / DRONE_SPEED_KMH) * 3600));
  return { etaSeconds, distanceKm, legLabel };
};

const formatEtaLabel = (eta) => {
  if (!eta) return '';
  const minutes = eta.etaSeconds / 60;
  const minutesText = minutes < 1 ? '<1 phút' : `${Math.max(1, Math.round(minutes))} phút`;
  const distanceText = eta.distanceKm >= 1 ? `${eta.distanceKm.toFixed(1)} km` : `${Math.round(eta.distanceKm * 1000)} m`;
  return `Ước tính còn ~${minutesText} (${distanceText}) để ${eta.legLabel}`;
};

function Orders() {
  const [orders, setOrders] = useState([]);
  const [restaurantNames, setRestaurantNames] = useState({});
  const [menuCache, setMenuCache] = useState({});
  const [currentCustomer, setCurrentCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [receivingOrderId, setReceivingOrderId] = useState(null);
  const [toastState, setToastState] = useState({ show: false, message: "" });
  const [droneTracking, setDroneTracking] = useState({});
  const [trackingVisible, setTrackingVisible] = useState({});
  const [routeCache, setRouteCache] = useState({});
  const trackingTimersRef = useRef({});
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const subscribedOrdersRef = useRef(new Set());
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchOrders = useCallback(
    async ({ silent = false } = {}) => {
      const token = getAuthToken(AUTH_ROLES.CUSTOMER);
      if (!token) {
        if (isMountedRef.current) {
          setError("Please log in to view your orders.");
          if (!silent) {
            setLoading(false);
          }
        }
        return;
      }

      if (!silent && isMountedRef.current) {
        setLoading(true);
      }

      try {
        const response = await axios.get(`${ORDER_SERVICE_URL}/api/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const sorted = Array.isArray(response.data)
          ? [...response.data].sort((a, b) => {
              const timeA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
              const timeB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
              return timeB - timeA;
            })
          : [];
        if (isMountedRef.current) {
          setError("");
          setOrders(sorted);
        }
      } catch (err) {
        console.error("Error fetching orders:", err);
        if (isMountedRef.current) {
          setError(err.response?.data?.message || "Unable to load orders. Please try again.");
        }
      } finally {
        if (!silent && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const token = getAuthToken(AUTH_ROLES.CUSTOMER);
    if (!token) return;

    const fetchProfile = async () => {
      try {
        const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const customer = response.data?.data?.customer;
        if (customer) {
          setCurrentCustomer(customer);
        }
      } catch (err) {
        console.error("Unable to fetch customer profile", err);
      }
    };

    fetchProfile();
  }, []);

  const ordersRef = useRef([]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const customerDisplayName = useMemo(() => {
    if (!currentCustomer) {
      return "";
    }
    const fullName = `${currentCustomer.firstName || ""} ${currentCustomer.lastName || ""}`.trim();
    if (fullName) {
      return fullName;
    }
    return currentCustomer.email || "Khách hàng thân thiết";
  }, [currentCustomer]);

  useEffect(() => {
    setFeedbackDrafts((prev) => {
      if (!Object.keys(prev).length) return prev;
      const allowedKeys = new Set(
        orders
          .map((order) => order?._id || order?.id)
          .filter(Boolean)
          .map((value) => String(value))
      );
      let changed = false;
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (allowedKeys.has(key)) {
          next[key] = value;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [orders]);

  const upsertDroneTracking = useCallback((orderId, payload = {}) => {
    if (!orderId) return;
    setDroneTracking((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {}),
        ...payload,
        orderId,
        updatedAt: payload.updatedAt || new Date().toISOString(),
      },
    }));
  }, []);

  const loadRoute = useCallback(
    async (orderId) => {
      if (!orderId || routeCache[orderId]) return;
      try {
        const res = await axios.post(`${DELIVERY_SERVICE_URL}/api/drone/auto-route`, { orderId });
        const waypoints = res.data?.data?.waypoints || [];
        if (waypoints.length) {
          setRouteCache((prev) => ({ ...prev, [orderId]: waypoints }));
        }
      } catch (_err) {
        // silent; fallback route may still display
      }
    },
    [routeCache]
  );

  const fetchDroneSnapshot = useCallback(async (orderId, droneId) => {
    if (!droneId || !orderId) return;
    try {
      const res = await axios.get(`${DELIVERY_SERVICE_URL}/api/drones/${encodeURIComponent(droneId)}`);
      const drone = res.data?.data || res.data;
      if (drone?.location?.lat && drone?.location?.lng) {
        upsertDroneTracking(String(orderId), {
          droneId: drone.droneId || drone.code || droneId,
          lat: drone.location.lat,
          lng: drone.location.lng,
          battery: typeof drone.batteryLevel === "number" ? drone.batteryLevel : drone.battery,
          status: drone.status,
          updatedAt: drone.updatedAt,
        });
      }
    } catch (_err) {
      // silent
    }
  }, [upsertDroneTracking]);

  const handleRealtimeEvent = useCallback(
    (message) => {
      if (!message || typeof message !== "object") return;
      const { event, payload } = message;
      if (!event) return;
      if (!isMountedRef.current) return;

      switch (event) {
        case "order.status.changed": {
          const orderId = payload?.orderId;
          if (!orderId) return;
          setOrders((prev) => {
            const index = prev.findIndex((order) => (order._id || order.id) === orderId);
            if (index === -1) {
              return prev;
            }
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: payload?.status || next[index].status,
              updatedAt: payload?.updatedAt || next[index].updatedAt,
            };
            return next;
          });
          fetchOrders({ silent: true });
          break;
        }
        case "order.created": {
          fetchOrders({ silent: true });
          break;
        }
        case "order.cancelled": {
          const orderId = payload?.orderId;
          if (!orderId) return;
          setOrders((prev) => {
            const index = prev.findIndex((order) => (order._id || order.id) === orderId);
            if (index === -1) {
              return prev;
            }
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: payload?.status || "Cancelled",
            };
            return next;
          });
          fetchOrders({ silent: true });
          if (payload?.refundEligible) {
            showToastMessage("Đơn đã hủy và hệ thống đang hoàn lại tiền cho bạn.");
          } else {
            showToastMessage("Đơn hàng đã được hủy.");
          }
          break;
        }
        case "order.refunded": {
          const orderId = payload?.orderId;
          if (!orderId) return;
          setOrders((prev) => {
            const index = prev.findIndex((order) => (order._id || order.id) === orderId);
            if (index === -1) {
              return prev;
            }
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: payload?.status || "Refunded",
              paymentStatus: "Refunded",
              financialSummary: {
                ...(next[index].financialSummary || {}),
                refundAmount: payload?.refundAmount ?? next[index].financialSummary?.refundAmount,
              },
            };
            return next;
          });
          const refundAmount = Number(payload?.refundAmount);
          if (Number.isFinite(refundAmount) && refundAmount > 0) {
            showToastMessage(`Đơn đã hoàn lại ${formatCurrency(refundAmount)} về phương thức thanh toán.`);
          } else {
            showToastMessage("Đơn đã được hoàn tiền về phương thức thanh toán.");
          }
          break;
        }
        case "order.feedback.updated": {
          const orderId = payload?.orderId;
          if (!orderId) return;
          setOrders((prev) => {
            const index = prev.findIndex((order) => (order._id || order.id) === orderId);
            if (index === -1) {
              return prev;
            }
            const next = [...prev];
            next[index] = {
              ...next[index],
              orderFeedback: payload?.orderFeedback ?? next[index].orderFeedback,
              deliveryFeedback: payload?.deliveryFeedback ?? next[index].deliveryFeedback,
            };
            return next;
          });
          setFeedbackDrafts((prev) => {
            const key = String(orderId);
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
          break;
        }
        case "drone-location-update":
        case "drone:tracking:update":
        case "drone-status-update": {
          const orderId = payload?.orderId || payload?.currentOrderId;
          if (!orderId) break;
          const normalizedId = String(orderId);
          upsertDroneTracking(normalizedId, {
            droneId: payload?.droneId,
            status: payload?.status,
            lat: payload?.lat ?? payload?.location?.lat,
            lng: payload?.lng ?? payload?.location?.lng,
            battery: payload?.battery ?? payload?.batteryLevel,
          });
          if (payload?.status) {
            setOrders((prev) =>
              prev.map((order) => {
                const oid = order?._id || order?.id;
                if (!oid || String(oid) !== normalizedId) return order;
                return {
                  ...order,
                  droneId: order.droneId || payload.droneId,
                  droneStatus: payload.status,
                };
              })
            );
          }
          break;
        }
        case "restaurant_wait_pickup": {
          const orderId = payload?.orderId;
          if (!orderId) break;
          const normalizedId = String(orderId);
          upsertDroneTracking(normalizedId, {
            droneId: payload?.droneId,
            status: "drone_arrived_restaurant",
          });
          setOrders((prev) =>
            prev.map((order) => {
              const oid = order?._id || order?.id;
              if (!oid || String(oid) !== normalizedId) return order;
              return { ...order, droneStatus: "drone_arrived_restaurant", droneId: order.droneId || payload?.droneId };
            })
          );
          break;
        }
        case "customer_wait_confirm": {
          const orderId = payload?.orderId;
          if (!orderId) break;
          const normalizedId = String(orderId);
          upsertDroneTracking(normalizedId, {
            droneId: payload?.droneId,
            status: "drone_arrived_customer",
          });
          setOrders((prev) =>
            prev.map((order) => {
              const oid = order?._id || order?.id;
              if (!oid || String(oid) !== normalizedId) return order;
              return {
                ...order,
                status: order.status || "drone_arrived_customer",
                droneStatus: "drone_arrived_customer",
                droneId: order.droneId || payload?.droneId,
              };
            })
          );
          break;
        }
        default:
          break;
      }
    },
    [fetchOrders, upsertDroneTracking]
  );

  useEffect(() => {
    const token = getAuthToken(AUTH_ROLES.CUSTOMER);
    if (!token) return;

    const socket = io(REALTIME_SERVICE_URL, {
      transports: ["websocket"],
      auth: { token },
    });

    socketRef.current = socket;
    socket.on("realtime:event", handleRealtimeEvent);
    socket.on("connect_error", (connError) => {
      console.error("Realtime connection error:", connError.message);
    });

    socket.on("connect", () => {
      const currentOrders = ordersRef.current || [];
      currentOrders.forEach((order) => {
        const orderId = order?._id || order?.id;
        if (orderId) {
          socket.emit("realtime:subscribe", `order:${orderId}`);
          subscribedOrdersRef.current.add(String(orderId));
        }
      });
    });

    return () => {
      socket.off("realtime:event", handleRealtimeEvent);
      socket.disconnect();
      socketRef.current = null;
      subscribedOrdersRef.current.clear();
    };
  }, [handleRealtimeEvent]);

  // Poll drone snapshot when người dùng mở map realtime
  useEffect(() => {
    Object.values(trackingTimersRef.current || {}).forEach((timerId) => clearInterval(timerId));
    trackingTimersRef.current = {};
    orders.forEach((order) => {
      const key = String(order._id || order.id);
      if (!trackingVisible[key] || !order.droneId) return;
      fetchDroneSnapshot(key, order.droneId);
      trackingTimersRef.current[key] = setInterval(() => fetchDroneSnapshot(key, order.droneId), 6000);
    });
    return () => {
      Object.values(trackingTimersRef.current || {}).forEach((timerId) => clearInterval(timerId));
      trackingTimersRef.current = {};
    };
  }, [fetchDroneSnapshot, orders, trackingVisible]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const currentIds = new Set();
    orders.forEach((order) => {
      const orderId = order?._id || order?.id;
      if (!orderId) return;
      const id = String(orderId);
      currentIds.add(id);
      if (!subscribedOrdersRef.current.has(id)) {
        socket.emit("realtime:subscribe", `order:${id}`);
        subscribedOrdersRef.current.add(id);
      }
    });

    Array.from(subscribedOrdersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        socket.emit("realtime:unsubscribe", `order:${id}`);
        subscribedOrdersRef.current.delete(id);
      }
    });
  }, [orders]);

  useEffect(() => {
    const missingIds = orders
      .filter(order => !order.restaurantName && order.restaurantId && !restaurantNames[order.restaurantId])
      .map(order => order.restaurantId);

    const uniqueIds = Array.from(new Set(missingIds));
    if (!uniqueIds.length) return;

    const token = getAuthToken(AUTH_ROLES.CUSTOMER);

    const fetchNames = async () => {
      try {
        const responses = await Promise.allSettled(
          uniqueIds.map(id =>
            axios.get(`${RESTAURANT_SERVICE_URL}/api/restaurants/${id}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            })
          )
        );

        const nextMap = {};
        responses.forEach((result, index) => {
          if (result.status === "fulfilled" && result.value?.data?.name) {
            nextMap[uniqueIds[index]] = result.value.data.name;
          }
        });

        if (Object.keys(nextMap).length) {
          setRestaurantNames(prev => ({ ...prev, ...nextMap }));
        }
      } catch (fetchErr) {
        console.error("Unable to fetch restaurant names", fetchErr);
      }
    };

    fetchNames();
  }, [orders, restaurantNames]);

  useEffect(() => {
    const restaurantsNeedingMenu = orders
      .filter((order) =>
        order.items?.some((item) => {
          if (item.foodName) return false;
          const foodKey = item.foodId ? String(item.foodId) : item._id ? String(item._id) : "";
          if (!foodKey) return false;
          const restaurantKey = order.restaurantId ? String(order.restaurantId) : "";
          return !(menuCache[restaurantKey]?.[foodKey]);
        })
      )
      .map((order) => (order.restaurantId ? String(order.restaurantId) : ""))
      .filter(Boolean);

    const uniqueRestaurantIds = Array.from(new Set(restaurantsNeedingMenu));
    if (!uniqueRestaurantIds.length) return;

    const fetchMenus = async () => {
      try {
        const responses = await Promise.allSettled(
          uniqueRestaurantIds.map(id =>
            axios.get(`${RESTAURANT_SERVICE_URL}/api/food-items/restaurant/${id}`)
          )
        );

        const nextCache = {};
        responses.forEach((result, index) => {
          if (result.status === "fulfilled" && Array.isArray(result.value?.data)) {
            const mapped = {};
            result.value.data.forEach((food) => {
              if (food?._id) {
                const key = String(food._id);
                mapped[key] = food.name || food.title || "";
              }
            });
            const restaurantKey = String(uniqueRestaurantIds[index]);
            nextCache[restaurantKey] = mapped;
          } else if (result.status === "rejected") {
            const restaurantKey = String(uniqueRestaurantIds[index]);
            nextCache[restaurantKey] = {};
          }
        });

        if (Object.keys(nextCache).length) {
          setMenuCache((prev) => ({ ...prev, ...nextCache }));
        }
      } catch (menuErr) {
        console.error("Unable to fetch menu details", menuErr);
      }
    };

    fetchMenus();
  }, [orders, menuCache]);

  // Handle delete order
  const handleDelete = (id) => {
    const token = getAuthToken(AUTH_ROLES.CUSTOMER);
    if (!token) {
      setError("Please log in to manage your orders.");
      return;
    }

    axios
      .delete(`${ORDER_SERVICE_URL}/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        setError("");
        const updatedOrder = response.data?.order;
        const refundEligible = Boolean(response.data?.refundEligible);
        setOrders((prevOrders) => {
          if (!updatedOrder) {
            return prevOrders.filter((order) => order._id !== id);
          }
          const exists = prevOrders.some(
            (order) => (order._id || order.id) === (updatedOrder._id || updatedOrder.id)
          );
          if (!exists) {
            return [updatedOrder, ...prevOrders];
          }
          return prevOrders.map((order) =>
            (order._id || order.id) === (updatedOrder._id || updatedOrder.id) ? updatedOrder : order
          );
        });
        if (refundEligible) {
          showToastMessage("Đã hủy đơn và hệ thống sẽ hoàn lại tiền trong giây lát.");
        } else {
          showToastMessage("Đơn hàng đã được hủy.");
        }
      })
      .catch((error) => {
        console.error("Error deleting order:", error);
        setError(error.response?.data?.message || "Failed to delete order.");
      });
  };

  const showToastMessage = (message) => {
    setToastState({ show: true, message });
  };

  const handleConfirmReceived = async (orderId) => {
    const normalizedId = orderId ? String(orderId) : "";
    if (!normalizedId) return;

    const token = getAuthToken(AUTH_ROLES.CUSTOMER);
    if (!token) {
      setError("Please log in to manage your orders.");
      return;
    }

    setReceivingOrderId(normalizedId);
    try {
      const response = await axios.patch(
        `${ORDER_SERVICE_URL}/api/orders/${normalizedId}/received`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const updatedOrder = response.data;
      const updatedId = updatedOrder?._id || updatedOrder?.id || normalizedId;
      setOrders((prev) =>
        prev.map((item) => {
          const itemId = item?._id || item?.id;
          if (!itemId) return item;
          return String(itemId) === String(updatedId) ? updatedOrder : item;
        })
      );
      setError("");
      showToastMessage("Đơn hàng đã hoàn tất");
      fetchOrders({ silent: true });
    } catch (err) {
      console.error("Error confirming order receipt:", err);
      const message =
        err.response?.data?.message || "Không thể xác nhận đơn hàng. Vui lòng thử lại.";
      setError(message);
    } finally {
      setReceivingOrderId(null);
    }
  };

  const categorizeOrder = (status = "") => status.trim().toLowerCase();

  const isRateableStatus = (status = "") => {
    const normalized = categorizeOrder(status);
    return normalized === "completed";
  };

  const startFeedbackForOrder = (order) => {
    const orderId = order?._id || order?.id;
    if (!orderId) return;
    const key = String(orderId);
    setFeedbackDrafts((prev) => ({
      ...prev,
      [key]: {
        mode: "edit",
        orderRating: order.orderFeedback?.rating || 0,
        orderComment: order.orderFeedback?.comment || "",
        driverRating: order.deliveryFeedback?.rating || 0,
        driverComment: order.deliveryFeedback?.comment || "",
        submitting: false,
        error: "",
      },
    }));
  };

  const cancelFeedbackForOrder = (orderId) => {
    if (!orderId) return;
    const key = String(orderId);
    setFeedbackDrafts((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const updateFeedbackDraft = (orderId, updates) => {
    if (!orderId) return;
    const key = String(orderId);
    setFeedbackDrafts((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: {
          ...current,
          ...updates,
        },
      };
    });
  };

  const handleSubmitFeedback = async (order, draft) => {
    const orderId = order?._id || order?.id;
    if (!orderId || !draft) return;
    if (!draft.orderRating && !draft.driverRating) {
      updateFeedbackDraft(orderId, {
        error: "Vui lòng chọn ít nhất một mức đánh giá.",
      });
      return;
    }

    updateFeedbackDraft(orderId, { submitting: true, error: "" });

    const token = getAuthToken(AUTH_ROLES.CUSTOMER);
    if (!token) {
      updateFeedbackDraft(orderId, {
        submitting: false,
        error: "Bạn cần đăng nhập để gửi đánh giá.",
      });
      return;
    }

    try {
      const response = await axios.post(
        `${ORDER_SERVICE_URL}/api/orders/${orderId}/feedback`,
        {
          orderRating: draft.orderRating || null,
          orderComment: draft.orderComment || "",
          driverRating: draft.driverRating || null,
          driverComment: draft.driverComment || "",
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const updatedOrder = response.data;
      setOrders((prev) =>
        prev.map((item) => (item._id === updatedOrder._id ? updatedOrder : item))
      );
      setFeedbackDrafts((prev) => {
        const next = { ...prev };
        delete next[String(orderId)];
        return next;
      });
    } catch (submitErr) {
      const message =
        submitErr.response?.data?.message ||
        "Không thể gửi đánh giá. Vui lòng thử lại.";
      updateFeedbackDraft(orderId, { submitting: false, error: message });
    }
  };

  const renderRatingStars = (value, onSelect) => (
    <div className="d-flex align-items-center gap-1 mt-2">
      {[1, 2, 3, 4, 5].map((score) => {
        const active = Number(value) >= score;
        return (
          <Button
            key={score}
            type="button"
            variant={active ? "warning" : "outline-secondary"}
            size="sm"
            className={active ? "text-dark" : ""}
            onClick={() => onSelect(score)}
          >
            {active ? <BsStarFill /> : <BsStar />}
          </Button>
        );
      })}
    </div>
  );

  const activeOrders = useMemo(
    () =>
      orders.filter((order) => {
        const status = categorizeOrder(order.status);
        return (
          status &&
          !["completed", "canceled", "cancelled", "failed", "refunded"].includes(status)
        );
      }),
    [orders]
  );

  const historyOrders = useMemo(
    () =>
      orders.filter((order) => {
        const status = categorizeOrder(order.status);
        return ["completed", "canceled", "cancelled", "failed", "refunded"].includes(status);
      }),
    [orders]
  );

  const displayRestaurantName = (order) => {
    if (order.restaurantName) return order.restaurantName;
    if (order.restaurantDetails?.name) return order.restaurantDetails.name;
    if (order.restaurantId && restaurantNames[order.restaurantId]) {
      return restaurantNames[order.restaurantId];
    }
    return order.restaurantId || "Nhà hàng";
  };

  const displayCustomerName = (order) => {
    if (order.customerName && order.customerName.trim()) {
      return order.customerName.trim();
    }

    const derived = `${order.customerDetails?.firstName || ""} ${order.customerDetails?.lastName || ""}`.trim();
    if (derived) {
      return derived;
    }

    if (currentCustomer && (!order.customerId || order.customerId === currentCustomer.id)) {
      const profileName = `${currentCustomer.firstName || ""} ${currentCustomer.lastName || ""}`.trim();
      if (profileName) {
        return profileName;
      }
      if (currentCustomer.email) {
        return currentCustomer.email;
      }
    }

    return order.customerId || "Khách hàng";
  };

  const displayFoodName = (order, item) => {
    if (item.foodName) return item.foodName;
    if (item.name) return item.name;

    const restaurantKey = order.restaurantId ? String(order.restaurantId) : "";
    const foodKey = item.foodId ? String(item.foodId) : item._id ? String(item._id) : "";
    if (restaurantKey && foodKey && menuCache[restaurantKey]?.[foodKey]) {
      return menuCache[restaurantKey][foodKey];
    }

    return foodKey ? 'Món đã xoá' : 'Món ăn';
  };

  const [selectedTab, setSelectedTab] = useState("active");

  const renderOrderList = (list, emptyMessage) => {
    if (!list.length) {
      return (
        <div className="text-center py-5 text-muted">
          {emptyMessage}
        </div>
      );
    }

    return list.map((order) => {
      const formattedDate = order.createdAt ? new Date(order.createdAt).toLocaleString() : "Không xác định";
      const statusLabel = order.status || "Pending";
      const paymentLabel = order.paymentStatus || "Pending";
      const badgeVariant =
        paymentLabel === "Paid"
          ? "success"
          : paymentLabel === "Refunded"
          ? "info"
          : paymentLabel === "Failed"
          ? "danger"
          : "warning";
      const orderId = order._id || order.id;
      const orderKey = orderId ? String(orderId) : "";
      const normalizedStatus = categorizeOrder(order.status);
      const canCancelOrder = normalizedStatus === "pending";
      const canConfirmReceipt =
        Boolean(orderKey) &&
        ["delivering", "drone_delivering", "drone_arriving_customer", "drone_arrived_customer", "customer_wait_confirm"].includes(normalizedStatus);
      const isReceiving = Boolean(orderKey && receivingOrderId === orderKey);
      const orderFeedback = order.orderFeedback || {};
      const driverFeedback = order.deliveryFeedback || {};
      const draft = orderKey ? feedbackDrafts[orderKey] : undefined;
      const isEditingFeedback = draft?.mode === "edit";
      const canRate = Boolean(orderKey) && isRateableStatus(order.status);
      const hasFeedback = Boolean(orderFeedback?.rating || driverFeedback?.rating);
      const draftOrderRating = draft?.orderRating ?? orderFeedback?.rating ?? 0;
      const draftDriverRating = draft?.driverRating ?? driverFeedback?.rating ?? 0;
      const submittingFeedback = Boolean(draft?.submitting);
      const feedbackError = draft?.error;
      const items = Array.isArray(order.items) ? order.items : [];
      const itemsTotal = roundCurrency(
        Number.isFinite(Number(order.itemsTotal))
          ? Number(order.itemsTotal)
          : items.reduce(
              (sum, item) =>
                sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0),
              0
            )
      );
      const shippingFee = roundCurrency(
        Number.isFinite(Number(order.shippingFee))
          ? Number(order.shippingFee)
          : computeShippingFee(items)
      );
      const grandTotal = roundCurrency(
        Number.isFinite(Number(order.totalPrice))
          ? Number(order.totalPrice)
          : itemsTotal + shippingFee
      );
      const summary = order.financialSummary || {};
      const vatAmount = roundCurrency(
        Number.isFinite(Number(summary.vatAmount))
          ? Number(summary.vatAmount)
          : Number.isFinite(Number(summary.taxLiability))
          ? Number(summary.taxLiability)
          : 0
      );
      const itemsNet = roundCurrency(
        Number.isFinite(Number(summary.itemsNet))
          ? Number(summary.itemsNet)
          : itemsTotal - vatAmount
      );
      const serviceFee = roundCurrency(
        Number.isFinite(Number(summary.driverServiceFee)) ? Number(summary.driverServiceFee) : 0
      );
      const refundAmountRaw = Number(summary.refundAmount);
      const hasRefund = paymentLabel === "Refunded" || (Number.isFinite(refundAmountRaw) && refundAmountRaw > 0);
      const refundDisplay = hasRefund
        ? (Number.isFinite(refundAmountRaw) && refundAmountRaw > 0 ? refundAmountRaw : grandTotal)
        : 0;

      return (
        <div key={order._id} className="bg-white rounded-3 shadow-sm p-4 mb-4 border border-light">
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3">
            <div>
              <h5 className="mb-1">Đơn hàng ngày {formattedDate}</h5>
              <p className="mb-1 text-secondary">Khách hàng: {displayCustomerName(order)}</p>
              <p className="mb-1 text-secondary">Nhà hàng: {displayRestaurantName(order)}</p>
              <p className="mb-1 text-secondary">Địa chỉ giao: {order.deliveryAddress}</p>
            </div>
            <div className="text-md-end">
              <Badge bg={badgeVariant} className="me-2">{paymentLabel}</Badge>
              <Badge bg="info">{statusLabel}</Badge>
            </div>
          </div>

          <div className="mt-3">
            {order.items.map((item, index) => (
              <div
                key={`${order._id}-${index}`}
                className="d-flex justify-content-between align-items-center py-2 border-bottom"
              >
                <div>
                  <strong>{displayFoodName(order, item)}</strong>
                  <div className="text-muted small">
                    SL: {item.quantity || 1} × {formatCurrency(item.price || 0)}
                  </div>
                </div>
                <div className="fw-semibold">
                  {formatCurrency((item.price || 0) * (item.quantity || 1))}
                </div>
              </div>
            ))}
          </div>

          <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mt-3 gap-3">
            <div>
              <div className="fw-bold fs-5">Tổng cộng: {formatCurrency(grandTotal)}</div>
              <div className="text-muted small">
                Giá món (chưa VAT) {formatCurrency(itemsNet)} • VAT {formatCurrency(vatAmount)} • Phí vận chuyển {formatCurrency(shippingFee)} • Phí dịch vụ {formatCurrency(serviceFee)}
              </div>
              {hasRefund && (
                <div className="text-info small fw-semibold mt-1">
                  Đã hoàn {formatCurrency(refundDisplay)} về phương thức thanh toán ban đầu.
                </div>
              )}
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <Link to={`/orders/details/${order._id}`}>
                <Button variant="primary" size="sm">
                  Xem chi tiết đơn
                </Button>
              </Link>
              {canCancelOrder && (
                <Button variant="outline-danger" size="sm" onClick={() => handleDelete(order._id)}>
                  Hủy đơn
                </Button>
              )}
              {canConfirmReceipt && (
                <Button
                  variant="success"
                  size="sm"
                  disabled={isReceiving}
                  onClick={() => handleConfirmReceived(orderKey)}
                >
                  {isReceiving ? "Đang xác nhận..." : "Đã nhận hàng"}
                </Button>
              )}
            </div>
          </div>

          {(() => {
            const tracking = droneTracking[orderKey];
            const stageText = mapDroneStage(order.droneStatus || order.status);
            if (!tracking && !stageText) return null;
            const lat = Number(tracking?.lat);
            const lng = Number(tracking?.lng);
            const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
            const fallbackRoute = (() => {
              const points = [];
              const hubPt = extractPoint(order.hubLocation || order.droneHubLocation);
              const restaurantPt = extractPoint(order.restaurantLocation || order.restaurantAddress || order.restaurant);
              const customerPt =
                extractPoint({ lat: order.deliveryLat, lng: order.deliveryLng }) ||
                extractPoint(order.deliveryLocation) ||
                extractPoint(order.customerLocation);
              if (hubPt) points.push({ ...hubPt, type: "hub", label: "Hub" });
              if (restaurantPt) points.push({ ...restaurantPt, type: "restaurant", label: "Restaurant" });
              if (customerPt) points.push({ ...customerPt, type: "customer", label: "Customer" });
              return points;
            })();
            const cachedRoute = routeCache[orderKey];
            const routePoints = hasCoords
              ? [{ lat, lng, type: "drone", label: tracking?.droneId || order.droneId || "Drone" }]
              : cachedRoute && cachedRoute.length
              ? cachedRoute.map((wp) => ({ lat: wp.lat, lng: wp.lng, type: wp.type?.toLowerCase(), label: wp.type }))
              : fallbackRoute;
            const flightEta = computeFlightEta(order, tracking);
            const etaLabel = formatEtaLabel(flightEta);
            const trackingOpen = Boolean(trackingVisible[orderKey]);
            return (
              <div className="alert alert-info mt-3 mb-0">
                <div className="fw-semibold mb-1">
                  Drone {tracking?.droneId || order.droneId || "chưa gán"}{" "}
                  {Number.isFinite(Number(tracking?.battery)) ? `• 🔋 ${tracking.battery}%` : ""}
                </div>
                <div className="small text-muted d-flex flex-wrap gap-2 align-items-center">
                  <span>
                    {stageText || "Đang theo dõi trạng thái giao hàng"}
                    {tracking?.status ? ` • ${tracking.status}` : ""}
                  </span>
                  {etaLabel && <span className="text-primary fw-semibold">{etaLabel}</span>}
                  <Button
                    size="sm"
                    variant={trackingOpen ? "outline-light" : "light"}
                    onClick={() =>
                      setTrackingVisible((prev) => {
                        const next = !prev[orderKey];
                        if (next) loadRoute(orderKey);
                        return { ...prev, [orderKey]: next };
                      })
                    }
                  >
                    {trackingOpen ? "Ẩn realtime drone" : "Xem realtime drone"}
                  </Button>
                </div>
                {trackingOpen && hasCoords && (
                  <div className="mt-2">
                    <div className="small mono">
                      GPS: {lat.toFixed(4)}, {lng.toFixed(4)}{" "}
                      <a
                        href={`https://www.google.com/maps?q=${lat},${lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ms-1"
                      >
                        Mở Google Maps
                      </a>
                    </div>
                    <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden" }}>
                      <DroneMapCanvas drones={[]} hubs={[]} routePoints={routePoints} height={220} />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {canRate && (
            <div className="mt-3 pt-3 border-top">
              {isEditingFeedback ? (
                <div className="bg-light rounded-3 p-3">
                  <h6 className="fw-semibold mb-3">Đánh giá trải nghiệm</h6>
                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-semibold">Đơn hàng</span>
                      <small className="text-muted">
                        {draftOrderRating ? `${draftOrderRating}/5` : "Chưa chọn"}
                      </small>
                    </div>
                    {renderRatingStars(draftOrderRating, (value) =>
                      updateFeedbackDraft(orderKey, { orderRating: value })
                    )}
                    <Form.Control
                      as="textarea"
                      rows={2}
                      className="mt-2"
                      placeholder="Chia sẻ cảm nhận về món ăn (tuỳ chọn)"
                      value={draft?.orderComment ?? ""}
                      onChange={(event) =>
                        updateFeedbackDraft(orderKey, { orderComment: event.target.value })
                      }
                    />
                  </div>
                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-semibold">Tài xế giao hàng</span>
                      <small className="text-muted">
                        {draftDriverRating ? `${draftDriverRating}/5` : "Chưa chọn"}
                      </small>
                    </div>
                    {renderRatingStars(draftDriverRating, (value) =>
                      updateFeedbackDraft(orderKey, { driverRating: value })
                    )}
                    <Form.Control
                      as="textarea"
                      rows={2}
                      className="mt-2"
                      placeholder="Nhận xét về tài xế (tuỳ chọn)"
                      value={draft?.driverComment ?? ""}
                      onChange={(event) =>
                        updateFeedbackDraft(orderKey, { driverComment: event.target.value })
                      }
                    />
                  </div>
                  {feedbackError && (
                    <div className="alert alert-danger py-2 px-3 mb-3">{feedbackError}</div>
                  )}
                  <div className="d-flex gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      disabled={submittingFeedback}
                      onClick={() => handleSubmitFeedback(order, draft)}
                    >
                      {submittingFeedback ? "Đang gửi..." : "Gửi đánh giá"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={submittingFeedback}
                      onClick={() => cancelFeedbackForOrder(orderId)}
                    >
                      Huỷ
                    </Button>
                  </div>
                </div>
              ) : hasFeedback ? (
                <div className="bg-light rounded-3 p-3 d-flex flex-column flex-md-row gap-3">
                  <div className="flex-grow-1">
                    <h6 className="text-uppercase text-muted fw-bold mb-2">Đánh giá của bạn</h6>
                    <div className="d-flex flex-column flex-md-row gap-3">
                      <div>
                        <p className="mb-1 fw-semibold">
                          Đơn hàng:{" "}
                          <span className="text-warning">
                            {orderFeedback?.rating ? `${orderFeedback.rating}/5` : "Chưa có"}
                          </span>
                        </p>
                        {orderFeedback?.comment && (
                          <p className="mb-0 text-muted">{orderFeedback.comment}</p>
                        )}
                      </div>
                      <div>
                        <p className="mb-1 fw-semibold">
                          Tài xế:{" "}
                          <span className="text-warning">
                            {driverFeedback?.rating ? `${driverFeedback.rating}/5` : "Chưa có"}
                          </span>
                        </p>
                        {driverFeedback?.comment && (
                          <p className="mb-0 text-muted">{driverFeedback.comment}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="d-flex align-items-start">
                    <Button size="sm" variant="outline-primary" onClick={() => startFeedbackForOrder(order)}>
                      Cập nhật đánh giá
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-light rounded-3 p-3 d-flex flex-column flex-md-row justify-content-between gap-3">
                  <div>
                    <h6 className="text-uppercase text-muted fw-bold mb-2">Đánh giá trải nghiệm</h6>
                    <p className="mb-0 text-secondary">
                      Đơn hàng đã hoàn tất. Hãy cho chúng tôi biết cảm nhận về món ăn và tài xế nhé!
                    </p>
                  </div>
                  <div className="d-flex align-items-start">
                    <Button size="sm" variant="primary" onClick={() => startFeedbackForOrder(order)}>
                      Đánh giá đơn hàng này
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="container text-center my-5">
        <Spinner animation="border" role="status" />
        <p className="mt-3">Loading orders...</p>
      </div>
    );
  }

  return (
    <CustomerLayout customerName={customerDisplayName}>
      <div className="container py-4">
      <div
        className="rounded-4 p-4 p-md-5 mb-4 text-white position-relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #ec4899 45%, #f97316 100%)",
          boxShadow: "0 25px 40px rgba(79,70,229,0.2)",
        }}
      >
        <div className="position-absolute top-0 end-0 opacity-50 pe-4 pt-4" style={{ fontSize: "64px" }}>
          🛵
        </div>
        <div className="position-relative" style={{ zIndex: 1 }}>
          <Button variant="light" size="sm" onClick={() => navigate("/customer/home")} className="mb-3">
            ← Về trang chính
          </Button>
          <h1 className="fw-bold mb-3">Theo dõi đơn hàng của bạn</h1>
          <p className="mb-0" style={{ maxWidth: 540 }}>
            Chủ động kiểm soát đơn hàng đang xử lý và xem lại lịch sử những bữa ăn gần đây của bạn. Nhấn “Xem chi tiết” để
            mở thông tin đầy đủ của từng đơn.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-4 p-4 p-md-5 shadow-sm border mb-4">
        <div className="row g-3 text-center text-md-start">
          <div className="col-12 col-md-4">
            <div className="p-3 rounded-3 bg-primary bg-opacity-10 h-100">
              <p className="text-muted mb-1">Tổng số đơn</p>
              <h3 className="fw-bold mb-0">{orders.length}</h3>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="p-3 rounded-3 bg-success bg-opacity-10 h-100">
              <p className="text-muted mb-1">Đang xử lý</p>
              <h3 className="fw-bold text-success mb-0">{activeOrders.length}</h3>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="p-3 rounded-3 bg-secondary bg-opacity-10 h-100">
              <p className="text-muted mb-1">Lịch sử</p>
              <h3 className="fw-bold text-secondary mb-0">{historyOrders.length}</h3>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="bg-white rounded-4 shadow-sm border p-3 mb-4">
        <div className="d-flex gap-3 flex-wrap">
          <button
            onClick={() => setSelectedTab("active")}
            className={`btn ${selectedTab === "active" ? "btn-primary" : "btn-outline-secondary"} rounded-pill px-4`}
          >
            Đơn hàng đang xử lý <span className="badge bg-light text-dark ms-2">{activeOrders.length}</span>
          </button>
          <button
            onClick={() => setSelectedTab("history")}
            className={`btn ${selectedTab === "history" ? "btn-primary" : "btn-outline-secondary"} rounded-pill px-4`}
          >
            Lịch sử đơn hàng <span className="badge bg-light text-dark ms-2">{historyOrders.length}</span>
          </button>
        </div>
      </div>

      <div className="bg-light bg-opacity-50 rounded-4 p-3 p-md-4">
        {selectedTab === "active"
          ? renderOrderList(activeOrders, "Bạn chưa có đơn hàng nào đang xử lý.")
          : renderOrderList(historyOrders, "Chưa có đơn hàng hoàn thành. Đặt món để trải nghiệm ngay nhé!")}
      </div>
      </div>
      <ToastContainer position="bottom-end" className="p-3">
        <Toast
          bg="success"
          onClose={() => setToastState({ show: false, message: "" })}
          show={toastState.show}
          delay={3000}
          autohide
        >
          <Toast.Body className="text-white">{toastState.message}</Toast.Body>
        </Toast>
      </ToastContainer>
    </CustomerLayout>
  );
}

export default Orders;
