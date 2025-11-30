import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { REALTIME_SERVICE_URL } from '../../utils/serviceUrls';
import { getAuthToken, AUTH_ROLES } from '../../utils/authTokens';

const DroneCenterContext = createContext(null);

// Consider a drone offline only if no update for 2 minutes (helps avoid rapid flip to offline in demo)
const OFFLINE_THRESHOLD_MS = 120_000;

const DEFAULT_HUBS = [
  {
    id: 'hub-hcm',
    name: 'HCM Central Hub',
    code: 'HCM',
    location: { lat: 10.776, lng: 106.7 },
    radiusKm: 12,
  },
  {
    id: 'hub-hn',
    name: 'HN West Hub',
    code: 'HN',
    location: { lat: 21.0285, lng: 105.8 },
    radiusKm: 10,
  },
];

const DEFAULT_DRONES = [
  {
    droneId: 'DR-001',
    name: 'Phoenix-1',
    battery: 82,
    status: 'delivering',
    hubId: 'hub-hcm',
    currentOrderId: 'ORD-10341',
    location: { lat: 10.7781, lng: 106.695 },
    updatedAt: new Date(Date.now() - 3000).toISOString(),
  },
  {
    droneId: 'DR-002',
    name: 'Phoenix-2',
    battery: 64,
    status: 'idle',
    hubId: 'hub-hcm',
    currentOrderId: '',
    location: { lat: 10.7711, lng: 106.69 },
    updatedAt: new Date(Date.now() - 15_000).toISOString(),
  },
  {
    droneId: 'DR-003',
    name: 'Falcon-1',
    battery: 29,
    status: 'returning',
    hubId: 'hub-hn',
    currentOrderId: 'ORD-20322',
    location: { lat: 21.025, lng: 105.812 },
    updatedAt: new Date(Date.now() - 6_000).toISOString(),
  },
  {
    droneId: 'DR-004',
    name: 'Kestrel',
    battery: 91,
    status: 'assigned',
    hubId: 'hub-hn',
    currentOrderId: '',
    location: { lat: 21.031, lng: 105.79 },
    updatedAt: new Date(Date.now() - 2_000).toISOString(),
  },
];

const DRONE_API_BASE_URL =
  process.env.REACT_APP_DRONE_API_URL ||
  process.env.REACT_APP_DELIVERY_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  'http://localhost:5010';

const REALTIME_URL = process.env.REACT_APP_DRONE_REALTIME_URL || REALTIME_SERVICE_URL;

const normalizeLocation = (raw = {}) => {
  if (Array.isArray(raw.coordinates) && raw.coordinates.length === 2) {
    return { lng: Number(raw.coordinates[0]), lat: Number(raw.coordinates[1]) };
  }
  if (Array.isArray(raw.currentLocation?.coordinates) && raw.currentLocation.coordinates.length === 2) {
    return { lng: Number(raw.currentLocation.coordinates[0]), lat: Number(raw.currentLocation.coordinates[1]) };
  }
  return {
    lat: Number(raw.lat ?? raw.latitude ?? raw.currentLocation?.lat ?? 0),
    lng: Number(raw.lng ?? raw.longitude ?? raw.currentLocation?.lng ?? raw.long ?? 0),
  };
};

const normalizeDrone = (raw = {}) => {
  const location = normalizeLocation(raw.currentLocation || raw.location || raw);
  return {
    droneId: raw.code || raw.droneId || raw.id || raw._id || '',
    name: raw.name || raw.label || raw.droneId || raw.code || 'Unnamed Drone',
    battery:
      typeof raw.batteryLevel === 'number'
        ? raw.batteryLevel
        : typeof raw.battery === 'number'
        ? raw.battery
        : Number(raw.batteryLevel ?? raw.battery ?? 0),
    status: raw.status ? raw.status.toLowerCase() : 'idle',
    hubId: raw.hubId || raw.hub || '',
    currentOrderId: raw.currentOrderId || raw.orderId || raw.currentOrder || '',
    location,
    updatedAt: raw.updatedAt || raw.lastUpdate || raw.timestamp || new Date().toISOString(),
    maintenanceStatus: raw.maintenanceStatus,
    nextMaintenanceDueAt: raw.nextMaintenanceDueAt,
  };
};

const normalizeHub = (raw = {}) => ({
  id: raw.id || raw._id || raw.hubId || raw.code || raw.name,
  name: raw.name || raw.label || 'Hub',
  code: raw.code,
  location: normalizeLocation(raw.address?.location || raw.location || raw),
  address: raw.address,
  radiusKm: Number(raw.radiusKm ?? raw.radius ?? 0),
  isActive: typeof raw.isActive === 'boolean' ? raw.isActive : true,
});

const mapStatusToBucket = (status = '') => {
  const normalized = status.toLowerCase();
  if (normalized === 'idle') return 'idle';
  if (normalized === 'returning') return 'returning';
  if (
    normalized === 'assigned' ||
    normalized === 'enroute_to_restaurant' ||
    normalized === 'picking' ||
    normalized === 'delivering' ||
    normalized === 'drone_enroute_to_restaurant'
  ) {
    return 'flying';
  }
  return 'flying';
};

export const useDroneCenter = () => {
  const ctx = useContext(DroneCenterContext);
  if (!ctx) {
    throw new Error('useDroneCenter must be used within DroneCenterProvider');
  }
  return ctx;
};

export const DroneCenterProvider = ({ children }) => {
  const [drones, setDrones] = useState(DEFAULT_DRONES);
  const [hubs, setHubs] = useState(DEFAULT_HUBS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [socketStatus, setSocketStatus] = useState('idle');
  const [events, setEvents] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const socketRef = useRef(null);
  const tokenRef = useRef(getAuthToken(AUTH_ROLES.SUPER_ADMIN) || getAuthToken(AUTH_ROLES.ADMIN) || null);

  const annotateDrones = useCallback((list) => {
    const now = Date.now();
    return list.map((drone) => {
      const lastUpdateMs = drone.updatedAt ? new Date(drone.updatedAt).getTime() : 0;
      const offline = lastUpdateMs ? now - lastUpdateMs > OFFLINE_THRESHOLD_MS : false;
      return { ...drone, lastUpdateMs, offline };
    });
  }, []);

  const refreshDrones = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${DRONE_API_BASE_URL}/api/drones`);
      const payload = Array.isArray(response.data) ? response.data : response.data?.data;
      if (Array.isArray(payload) && payload.length) {
        const normalized = payload.map(normalizeDrone);
        setDrones(normalized);
        setError('');
      } else if (!drones.length) {
        setDrones(DEFAULT_DRONES);
      }
    } catch (err) {
      if (!drones.length) {
        setDrones(DEFAULT_DRONES);
      }
      setError('Không thể tải danh sách drone từ API. Đang dùng dữ liệu demo.');
    } finally {
      setLoading(false);
    }
  }, [drones.length]);

  const refreshDeliveries = useCallback(async () => {
    try {
      const response = await axios.get(`${DRONE_API_BASE_URL}/api/drone-deliveries`);
      const payload = Array.isArray(response.data) ? response.data : response.data?.data;
      if (Array.isArray(payload)) {
        const enriched = await Promise.all(
          payload.map(async (item) => {
            const waypoints = item?.route?.waypoints;
            if (Array.isArray(waypoints) && waypoints.length >= 3) return item;
            if (!item?.orderId) return item;
            try {
              const res = await axios.post(`${DRONE_API_BASE_URL}/api/drone/auto-route`, {
                orderId: item.orderId,
                hubId: item.hubId,
                droneId: item.droneId,
              });
              const data = res.data?.data || {};
              const route = {
                ...(item.route || {}),
                waypoints: Array.isArray(data.waypoints) ? data.waypoints : item.route?.waypoints || [],
                distance: data.distanceMeters || item.route?.distance,
                duration: data.etaSeconds || item.route?.duration,
              };
              return { ...item, route };
            } catch (_err) {
              return item;
            }
          })
        );
        setDeliveries(enriched);
      }
    } catch (err) {
      // silent for now
    }
  }, []);

  const refreshHubs = useCallback(async () => {
    try {
      const response = await axios.get(`${DRONE_API_BASE_URL}/api/hubs`);
      const payload = Array.isArray(response.data) ? response.data : response.data?.data;
      if (Array.isArray(payload) && payload.length) {
        setHubs(payload.map(normalizeHub));
      } else if (!hubs.length) {
        setHubs(DEFAULT_HUBS);
      }
    } catch (err) {
      if (!hubs.length) {
        setHubs(DEFAULT_HUBS);
      }
    }
  }, [hubs.length]);

  const upsertDrone = useCallback((incoming) => {
    const normalized = normalizeDrone(incoming);
    setDrones((prev) => {
      const index = prev.findIndex((item) => item.droneId === normalized.droneId);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          ...normalized,
          location: normalized.location.lat || normalized.location.lng ? normalized.location : copy[index].location,
          updatedAt: normalized.updatedAt || new Date().toISOString(),
        };
        return copy;
      }
      return [
        {
          ...normalized,
          updatedAt: normalized.updatedAt || new Date().toISOString(),
        },
        ...prev,
      ];
    });
  }, []);

  const recordEvent = useCallback((entry) => {
    setEvents((prev) => [entry, ...prev].slice(0, 30));
  }, []);

  const applyLocationUpdate = useCallback(
    (payload) => {
      const normalized = {
        ...payload,
        location: normalizeLocation(payload),
        battery: payload.battery ?? payload.batteryLevel,
        updatedAt: payload.updatedAt || new Date().toISOString(),
      };
      upsertDrone(normalized);
      recordEvent({
        type: 'drone-location-update',
        timestamp: normalized.updatedAt,
        droneId: normalized.droneId,
        battery: normalized.battery,
        location: normalized.location,
      });
    },
    [recordEvent, upsertDrone]
  );

  const createHub = useCallback(async (payload) => {
    const normalized = normalizeHub(payload);
    try {
        const response = await axios.post(`${DRONE_API_BASE_URL}/api/hubs`, normalized);
      const data = response.data?.data || response.data || normalized;
      setHubs((prev) => [...prev, normalizeHub(data)]);
      return { ok: true };
    } catch (err) {
      setHubs((prev) => [...prev, normalized]);
      return { ok: false, error: err?.message || 'Không thể tạo hub. Đã thêm tạm thời.' };
    }
  }, []);

  const updateHub = useCallback(async (id, payload) => {
    const normalized = normalizeHub(payload);
    try {
      await axios.put(`${DRONE_API_BASE_URL}/api/hubs/${id}`, normalized);
      setHubs((prev) => prev.map((hub) => (hub.id === id ? { ...hub, ...normalized } : hub)));
      return { ok: true };
    } catch (err) {
      setHubs((prev) => prev.map((hub) => (hub.id === id ? { ...hub, ...normalized } : hub)));
      return { ok: false, error: err?.message || 'Không thể cập nhật hub. Đã lưu tạm thời.' };
    }
  }, []);

  const deleteHub = useCallback(async (id) => {
    try {
      await axios.delete(`${DRONE_API_BASE_URL}/api/hubs/${id}`);
      setHubs((prev) => prev.filter((hub) => hub.id !== id));
      return { ok: true };
    } catch (err) {
      setHubs((prev) => prev.filter((hub) => hub.id !== id));
      return { ok: false, error: err?.message || 'Không thể xóa hub. Đã gỡ khỏi UI tạm thời.' };
    }
  }, []);

  const createDelivery = useCallback(
    async (payload) => {
      try {
        const response = await axios.post(`${DRONE_API_BASE_URL}/api/drone-deliveries`, payload);
        await refreshDeliveries();
        await refreshDrones();
        return { ok: true, data: response.data?.data || response.data };
      } catch (err) {
        return { ok: false, error: err?.response?.data?.message || err?.message || 'Không thể tạo phân công drone' };
      }
    },
    [refreshDeliveries, refreshDrones]
  );

  const appendTrackingLog = useCallback(async (assignmentId, payload) => {
    try {
      const response = await axios.post(`${DRONE_API_BASE_URL}/api/drone-deliveries/${assignmentId}/logs`, payload);
      await refreshDrones();
      return { ok: true, data: response.data?.data || response.data };
    } catch (err) {
      return { ok: false, error: err?.response?.data?.message || err?.message || 'Không thể ghi tracking log' };
    }
  }, [refreshDrones]);

  const addMaintenanceLog = useCallback(
    async (droneId, logEntry, nextStatus) => {
      const target = drones.find((d) => d.droneId === droneId || d.id === droneId);
      const logs = Array.isArray(target?.maintenanceLogs) ? [...target.maintenanceLogs] : [];
      logs.push(logEntry);
      try {
        await axios.put(`${DRONE_API_BASE_URL}/api/drones/${droneId}`, {
          maintenanceLogs: logs,
          maintenanceStatus: nextStatus || target?.maintenanceStatus || 'IN_SERVICE',
          nextMaintenanceDueAt: logEntry.nextMaintenanceDueAt,
        });
        await refreshDrones();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err?.response?.data?.message || err?.message || 'Không thể lưu bảo trì' };
      }
    },
    [drones, refreshDrones]
  );

  useEffect(() => {
    refreshDrones();
    refreshHubs();
    refreshDeliveries();
  }, [refreshDeliveries, refreshDrones, refreshHubs]);

  // Polling fallback to keep UI fresh if socket misses events
  useEffect(() => {
    const timer = setInterval(() => {
      refreshDrones();
      refreshDeliveries();
    }, 7000);
    return () => clearInterval(timer);
  }, [refreshDeliveries, refreshDrones]);

  useEffect(() => {
    const candidates = [
      REALTIME_URL,
      process.env.REACT_APP_DRONE_API_URL,
      process.env.REACT_APP_DELIVERY_URL,
    ].filter(Boolean);

    let activeSocket = null;
    let currentIndex = 0;
    let cleaned = false;

    const tryConnect = () => {
      if (currentIndex >= candidates.length) {
        setSocketStatus('error');
        return;
      }
      const url = candidates[currentIndex];
      const auth = tokenRef.current ? { token: tokenRef.current } : undefined;
      const socket = io(url, { transports: ['websocket'], autoConnect: true, auth });
      socketRef.current = socket;
      activeSocket = socket;

      socket.on('connect', () => setSocketStatus('connected'));
      socket.on('disconnect', () => setSocketStatus('disconnected'));
      socket.on('connect_error', () => {
        setSocketStatus('error');
        socket.disconnect();
        currentIndex += 1;
        tryConnect();
      });

      socket.on('drone-location-update', (payload) => applyLocationUpdate(payload || {}));
      socket.on('drone:tracking:update', (payload) =>
        applyLocationUpdate({
          ...payload,
          lat: payload?.lat,
          lng: payload?.lng,
          updatedAt: payload?.timestamp,
        })
      );
      socket.on('drone-status-update', (payload) => {
        if (payload) {
          upsertDrone(payload);
          recordEvent({ type: 'drone-status-update', timestamp: new Date().toISOString(), ...payload });
        }
      });
    socket.on('order-status-update', (payload) => {
      if (payload) {
        recordEvent({ type: 'order-status-update', timestamp: new Date().toISOString(), ...payload });
      }
    });
    socket.on('restaurant_wait_pickup', (payload) => {
      if (payload) {
        recordEvent({ type: 'restaurant_wait_pickup', timestamp: new Date().toISOString(), ...payload });
      }
    });
    socket.on('customer_wait_confirm', (payload) => {
      if (payload) {
        recordEvent({ type: 'customer_wait_confirm', timestamp: new Date().toISOString(), ...payload });
      }
    });
    socket.on('drone_waypoint_update', (payload) => {
      if (payload) {
        recordEvent({ type: 'drone_waypoint_update', timestamp: new Date().toISOString(), ...payload });
      }
    });
    socket.on('drone_route_complete', (payload) => {
      if (payload) {
        recordEvent({ type: 'drone_route_complete', timestamp: new Date().toISOString(), ...payload });
      }
    });
    socket.on('order_auto_route_loaded', (payload = {}) => {
      if (payload) {
        recordEvent({ type: 'order_auto_route_loaded', timestamp: new Date().toISOString(), ...payload });
      }
    });
    };

    tryConnect();

    return () => {
      cleaned = true;
      if (activeSocket) {
        activeSocket.off('drone-location-update');
        activeSocket.off('drone:tracking:update');
        activeSocket.off('drone-status-update');
        activeSocket.off('order-status-update');
        activeSocket.off('restaurant_wait_pickup');
        activeSocket.off('customer_wait_confirm');
        activeSocket.off('drone_waypoint_update');
        activeSocket.off('drone_route_complete');
        activeSocket.off('order_auto_route_loaded');
        activeSocket.disconnect();
      }
    };
  }, [applyLocationUpdate, recordEvent, upsertDrone]);

  const annotated = useMemo(() => annotateDrones(drones), [annotateDrones, drones]);

  const stats = useMemo(() => {
    const totals = {
      total: annotated.length,
      flying: 0,
      idle: 0,
      returning: 0,
      offline: 0,
      lowBattery: 0,
    };
    const lowBatteryList = [];
    const offlineList = [];

    annotated.forEach((drone) => {
      const bucket = mapStatusToBucket(drone.status);
      totals[bucket] += 1;
      if (drone.offline) {
        totals.offline += 1;
        offlineList.push(drone);
      }
      if (typeof drone.battery === 'number' && drone.battery < 30) {
        totals.lowBattery += 1;
        lowBatteryList.push(drone);
      }
    });

    return { totals, lowBatteryList, offlineList };
  }, [annotated]);

  return (
    <DroneCenterContext.Provider
      value={{
        drones: annotated,
        hubs,
        deliveries,
        loading,
        error,
        socketStatus,
        events,
        stats,
        apiBase: DRONE_API_BASE_URL,
        refreshDrones,
        refreshHubs,
        refreshDeliveries,
        applyLocationUpdate,
        createHub,
        updateHub,
        deleteHub,
        createDelivery,
        appendTrackingLog,
        addMaintenanceLog,
        offlineThresholdMs: OFFLINE_THRESHOLD_MS,
      }}
    >
      {children}
    </DroneCenterContext.Provider>
  );
};
