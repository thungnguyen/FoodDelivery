import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import DroneMapCanvas from './components/DroneMapCanvas';
import { useDroneCenter } from './DroneCenterContext';
import { ORDER_SERVICE_URL } from '../../utils/serviceUrls';
import { AUTH_ROLES, getAuthToken } from '../../utils/authTokens';

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const haversineKm = (a, b) => {
  if (!a || !b) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad((b.lat || 0) - (a.lat || 0));
  const dLng = toRad((b.lng || 0) - (a.lng || 0));
  const lat1 = toRad(a.lat || 0);
  const lat2 = toRad(b.lat || 0);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const AssignPage = () => {
  const { hubs, drones, deliveries, createDelivery, apiBase } = useDroneCenter();
  const [form, setForm] = useState({
    orderId: '',
    restaurantLat: '',
    restaurantLng: '',
    customerLat: '',
    customerLng: '',
    hubId: '',
    droneId: '',
  });
  const [feedback, setFeedback] = useState('');
  const [routePoints, setRoutePoints] = useState([]);
  const [routeMeta, setRouteMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedHubId, setSelectedHubId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [assignError, setAssignError] = useState('');
  const [orderQueue, setOrderQueue] = useState([]);
  const [orderError, setOrderError] = useState('');

  const orderHeaders = useMemo(() => {
    const token = getAuthToken(AUTH_ROLES.SUPER_ADMIN) || getAuthToken(AUTH_ROLES.ADMIN);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const restaurantPoint = useMemo(
    () => ({ lat: toNumber(form.restaurantLat), lng: toNumber(form.restaurantLng) }),
    [form.restaurantLat, form.restaurantLng]
  );
  const customerPoint = useMemo(
    () => ({ lat: toNumber(form.customerLat), lng: toNumber(form.customerLng) }),
    [form.customerLat, form.customerLng]
  );

  useEffect(() => {
    if (!selectedHubId && hubs.length) {
      setSelectedHubId(hubs[0]._id || hubs[0].id || hubs[0].code);
    }
  }, [hubs, selectedHubId]);

  const hubOptions = useMemo(
    () => hubs.map((hub) => ({ id: hub._id || hub.id || hub.code, name: hub.name || hub.code, location: hub.location })),
    [hubs]
  );

  const hubWaitingOrders = useMemo(() => {
    const queue = Array.isArray(orderQueue) ? orderQueue : [];
    const filtered = queue.filter(
      (order) => (order.droneStatus || order.status || '').toLowerCase() === 'waiting_for_drone'
    );
    if (!selectedHubId) return filtered;
    return filtered.filter((item) => String(item.droneHubId || item.hubId || item.hub_id) === String(selectedHubId));
  }, [orderQueue, selectedHubId]);

  const hubDrones = useMemo(() => {
    if (!selectedHubId) return drones;
    return drones.filter((drone) => String(drone.hubId || drone.hub_id || drone.hub) === String(selectedHubId));
  }, [drones, selectedHubId]);

  const recommendedHub = useMemo(() => {
    if (!hubs.length || !restaurantPoint.lat || !customerPoint.lat) return null;
    const scores = hubs.map((hub) => {
      const distance = haversineKm(hub.location, restaurantPoint) + haversineKm(restaurantPoint, customerPoint);
      return { hub, distance };
    });
    scores.sort((a, b) => a.distance - b.distance);
    return scores[0]?.hub || null;
  }, [customerPoint, hubs, restaurantPoint]);

  const availableDrones = useMemo(() => {
    const targetHubId = form.hubId || recommendedHub?.id || recommendedHub?._id;
    return drones.filter(
      (drone) =>
        (drone.hubId === targetHubId || (!drone.hubId && !targetHubId)) &&
        (!drone.status || drone.status.toLowerCase() === 'idle')
    );
  }, [drones, form.hubId, recommendedHub]);

  const handleRecommend = () => {
    if (recommendedHub) {
      setForm((prev) => ({ ...prev, hubId: recommendedHub.id || recommendedHub._id || recommendedHub.code }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback('');
    setAssignError('');
    if (!form.orderId || !restaurantPoint.lat || !customerPoint.lat) {
      setFeedback('Nhập Order ID và tọa độ nhà hàng/khách hàng.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        orderId: form.orderId.trim(),
        hubId: form.hubId || recommendedHub?.id || recommendedHub?._id,
        droneId: form.droneId,
        restaurantLocation: [restaurantPoint.lng, restaurantPoint.lat],
        customerLocation: [customerPoint.lng, customerPoint.lat],
      };
      const res = await createDelivery(payload);
      if (res.ok) {
        setFeedback('Đã tạo phân công drone.');
        const delivery = res.data;
        const route = delivery?.route;
        if (route?.waypoints?.length) {
          setRoutePoints(
            route.waypoints.map((wp) => ({
              lat: wp.lat,
              lng: wp.lng,
              type: wp.type?.toLowerCase(),
              label: wp.type,
            }))
          );
          setRouteMeta({
            distance: route.distance,
            duration: route.duration,
          });
        } else {
          setRoutePoints([
            recommendedHub?.location && { ...recommendedHub.location, type: 'hub', label: recommendedHub.name },
            { ...restaurantPoint, type: 'restaurant', label: 'Nhà hàng' },
            { ...customerPoint, type: 'customer', label: 'Khách hàng' },
          ].filter(Boolean));
        }
      } else {
        setFeedback(res.error || 'Không thể tạo phân công');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAssignExisting = async (order) => {
    const hubId = selectedHubId || order?.hubId;
    if (!order || !hubId || !form.droneId) {
      setAssignError('Chọn hub, đơn và drone trước khi gán.');
      return;
    }
    setLoading(true);
    setAssignError('');
    try {
      const res = await axios.post(`${apiBase}/api/drone-deliveries`, {
        orderId: order.orderId || order._id || order.id,
        hubId,
        droneId: form.droneId,
        status: order.status || 'PENDING',
      });
      if (res.status >= 200 && res.status < 300) {
        setFeedback('Đã gán drone cho đơn.');
      } else {
        setAssignError(res.data?.message || 'Không thể gán drone.');
      }
    } catch (err) {
      setAssignError(err?.response?.data?.message || 'Không thể gán drone.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderQueue = useCallback(async () => {
    try {
      const res = await axios.get(`${ORDER_SERVICE_URL}/api/drone/orders-queue`, { headers: orderHeaders });
      const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.data) ? res.data.data : [];
      setOrderQueue(list);
      setOrderError('');
    } catch (err) {
      setOrderError(err?.response?.data?.message || 'Không tải được hàng đợi drone');
      setOrderQueue([]);
    }
  }, [orderHeaders]);

  useEffect(() => {
    fetchOrderQueue();
    const timer = setInterval(fetchOrderQueue, 12000);
    return () => clearInterval(timer);
  }, [fetchOrderQueue]);

  const fetchPreviewRoute = async () => {
    if (!restaurantPoint.lat || !customerPoint.lat || !recommendedHub?.location) return;
    setLoading(true);
    try {
      const response = await axios.post(`${apiBase}/api/drone-deliveries`, {
        orderId: `preview-${Date.now()}`,
        hubId: recommendedHub.id || recommendedHub._id,
        restaurantLocation: [restaurantPoint.lng, restaurantPoint.lat],
        customerLocation: [customerPoint.lng, customerPoint.lat],
        status: 'PENDING',
      });
      const delivery = response.data?.data || response.data;
      const route = delivery?.route;
      if (route?.waypoints?.length) {
        setRoutePoints(
          route.waypoints.map((wp) => ({
            lat: wp.lat,
            lng: wp.lng,
            type: wp.type?.toLowerCase(),
            label: wp.type,
          }))
        );
        setRouteMeta({
          distance: route.distance,
          duration: route.duration,
        });
      }
      setFeedback('Đã dựng trước tuyến bay (PENDING).');
    } catch (err) {
      setFeedback(err?.response?.data?.message || 'Không dựng được tuyến preview.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="panel">
        <div className="flex between" style={{ marginBottom: 12 }}>
          <div>
            <h2>Assign Orders by Hub</h2>
            <div className="text-muted">Chọn hub → xem đơn waiting_for_drone → gán drone thuộc hub đó</div>
          </div>
          {feedback && <span className="badge">{feedback}</span>}
          {assignError && <span className="badge error">{assignError}</span>}
        </div>

        <div className="flex" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <label className="text-muted">Hub</label>
            <select value={selectedHubId} onChange={(e) => setSelectedHubId(e.target.value)}>
              {hubOptions.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hub.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted">Drone (hub)</label>
            <select value={form.droneId} onChange={(e) => setForm((p) => ({ ...p, droneId: e.target.value }))}>
              <option value="">Chọn drone</option>
              {hubDrones.map((drone) => (
                <option key={drone.droneId} value={drone.droneId}>
                  {drone.droneId} • {drone.status || 'idle'} • 🔋 {drone.battery ?? '--'}%
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
          <div className="glass" style={{ padding: 12, borderRadius: 10 }}>
            <div className="flex between" style={{ marginBottom: 8 }}>
              <strong>Đơn chờ gán (hub)</strong>
              <span className="badge">{hubWaitingOrders.length}</span>
            </div>
            {hubWaitingOrders.length === 0 ? (
              <div className="muted">Không có đơn waiting_for_drone thuộc hub này.</div>
            ) : (
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                {hubWaitingOrders.map((order) => (
                  <div
                    key={order._id || order.id || order.orderId}
                    className={`assign-card${selectedOrderId === (order._id || order.id || order.orderId) ? ' active' : ''}`}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid #1f2a37',
                      marginBottom: 8,
                      cursor: 'pointer',
                      background: '#0b1624',
                    }}
                    onClick={() => {
                      setSelectedOrderId(order._id || order.id || order.orderId);
                      setRoutePoints(
                        (order.route?.waypoints || []).map((wp) => ({
                          lat: wp.lat,
                          lng: wp.lng,
                          type: wp.type?.toLowerCase(),
                          label: wp.type,
                        }))
                      );
                      setRouteMeta({ distance: order.route?.distance, duration: order.route?.duration });
                    }}
                  >
                    <div className="flex between">
                      <div>
                        <div className="mono">#{String(order.orderId || order._id).slice(-6)}</div>
                        <div className="muted">
                          KH: {order.customerId || '—'} • NH: {order.restaurantId || '—'}
                        </div>
                        <div className="muted">Hub: {order.hubId || order.droneHubId || selectedHubId || '—'}</div>
                      </div>
                      <span className="pill waiting">waiting_for_drone</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass" style={{ padding: 12, borderRadius: 10 }}>
            <div className="flex between" style={{ marginBottom: 8 }}>
              <strong>Drone thuộc hub</strong>
              <span className="badge">{hubDrones.length}</span>
            </div>
            {hubDrones.length === 0 ? (
              <div className="muted">Chưa có drone trong hub này.</div>
            ) : (
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                {hubDrones.map((drone) => (
                  <div
                    key={drone.droneId}
                    className="flex between"
                    style={{ padding: 10, borderRadius: 10, border: '1px solid #1f2a37', marginBottom: 8 }}
                  >
                    <div>
                      <div className="fw-semibold">{drone.droneId}</div>
                      <div className="muted">
                        {drone.status || 'idle'} • 🔋 {drone.battery ?? '--'}%
                      </div>
                    </div>
                    <button
                      className="btn primary small"
                      disabled={!selectedOrderId}
                      onClick={() => {
                        const order = hubWaitingOrders.find(
                          (o) => (o._id || o.id || o.orderId) === selectedOrderId
                        );
                        if (order) handleAssignExisting(order);
                      }}
                    >
                      Gán đơn
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="flex between">
          <h3>Route preview</h3>
          {routeMeta && (
            <span className="badge">
              {(routeMeta.distance / 1000)?.toFixed?.(2) || '--'} km • {Math.round((routeMeta.duration || 0) / 60)} phút
            </span>
          )}
        </div>
        <DroneMapCanvas drones={[]} hubs={hubs} routePoints={routePoints} height={420} />
      </div>
    </>
  );
};

export default AssignPage;
