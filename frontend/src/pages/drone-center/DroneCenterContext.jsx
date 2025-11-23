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

const DroneCenterContext = createContext(null);

const OFFLINE_THRESHOLD_MS = 10_000;

const DEFAULT_HUBS = [
  {
    id: 'hub-hcm',
    name: 'HCM Central Hub',
    location: { lat: 10.776, lng: 106.7 },
    radiusKm: 12,
  },
  {
    id: 'hub-hn',
    name: 'HN West Hub',
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

const DRONE_API_BASE =
  process.env.REACT_APP_DRONE_API_URL ||
  process.env.REACT_APP_DELIVERY_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  'http://localhost:5010';

const REALTIME_URL = process.env.REACT_APP_DRONE_REALTIME_URL || REALTIME_SERVICE_URL;

const normalizeLocation = (raw = {}) => ({
  lat: Number(raw.lat ?? raw.latitude ?? 0),
  lng: Number(raw.lng ?? raw.longitude ?? raw.long ?? 0),
});

const normalizeDrone = (raw = {}) => {
  const location = normalizeLocation(raw.location || raw);
  return {
    droneId: raw.droneId || raw.id || raw._id || '',
    name: raw.name || raw.label || raw.droneId || 'Unnamed Drone',
    battery: typeof raw.battery === 'number' ? raw.battery : Number(raw.battery ?? 0),
    status: raw.status || 'idle',
    hubId: raw.hubId || raw.hub || '',
    currentOrderId: raw.currentOrderId || raw.orderId || raw.currentOrder || '',
    location,
    updatedAt: raw.updatedAt || raw.lastUpdate || raw.timestamp || new Date().toISOString(),
  };
};

const normalizeHub = (raw = {}) => ({
  id: raw.id || raw._id || raw.hubId || raw.name,
  name: raw.name || raw.label || 'Hub',
  location: normalizeLocation(raw.location || raw),
  radiusKm: Number(raw.radiusKm ?? raw.radius ?? 0),
});

const addLeafletAssets = () => {
  if (typeof document === 'undefined') {
    return;
  }

  const cssHref = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    document.head.appendChild(link);
  }

  if (!window.L && !document.querySelector('script[data-drone-center-leaflet]')) {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.setAttribute('data-drone-center-leaflet', 'true');
    document.body.appendChild(script);
  }
};

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
  const socketRef = useRef(null);

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
      const response = await axios.get(`${DRONE_API_BASE}/api/drones`);
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

  const refreshHubs = useCallback(async () => {
    try {
      const response = await axios.get(`${DRONE_API_BASE}/api/hubs`);
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
      const response = await axios.post(`${DRONE_API_BASE}/api/hubs`, normalized);
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
      await axios.put(`${DRONE_API_BASE}/api/hubs/${id}`, normalized);
      setHubs((prev) => prev.map((hub) => (hub.id === id ? { ...hub, ...normalized } : hub)));
      return { ok: true };
    } catch (err) {
      setHubs((prev) => prev.map((hub) => (hub.id === id ? { ...hub, ...normalized } : hub)));
      return { ok: false, error: err?.message || 'Không thể cập nhật hub. Đã lưu tạm thời.' };
    }
  }, []);

  const deleteHub = useCallback(async (id) => {
    try {
      await axios.delete(`${DRONE_API_BASE}/api/hubs/${id}`);
      setHubs((prev) => prev.filter((hub) => hub.id !== id));
      return { ok: true };
    } catch (err) {
      setHubs((prev) => prev.filter((hub) => hub.id !== id));
      return { ok: false, error: err?.message || 'Không thể xóa hub. Đã gỡ khỏi UI tạm thời.' };
    }
  }, []);

  useEffect(() => {
    refreshDrones();
    refreshHubs();
    addLeafletAssets();
  }, [refreshDrones, refreshHubs]);

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
      const socket = io(url, { transports: ['websocket'], autoConnect: true });
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
    };

    tryConnect();

    return () => {
      cleaned = true;
      if (activeSocket) {
        activeSocket.off('drone-location-update');
        activeSocket.off('drone-status-update');
        activeSocket.off('order-status-update');
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
        loading,
        error,
        socketStatus,
        events,
        stats,
        apiBase: DRONE_API_BASE,
        refreshDrones,
        refreshHubs,
        applyLocationUpdate,
        createHub,
        updateHub,
        deleteHub,
        offlineThresholdMs: OFFLINE_THRESHOLD_MS,
      }}
    >
      {children}
    </DroneCenterContext.Provider>
  );
};
