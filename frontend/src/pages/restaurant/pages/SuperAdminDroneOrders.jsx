import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { DELIVERY_SERVICE_URL, ORDER_SERVICE_URL } from '../../../utils/serviceUrls';
import { getAuthToken, AUTH_ROLES } from '../../../utils/authTokens';
import DroneMapCanvas from '../../drone-center/components/DroneMapCanvas';
import '../styles/dashboard.css';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'WAITING_FOR_DRONE', label: 'Chờ gán drone' },
  { value: 'DRONE_ASSIGNED', label: 'Drone đã gán' },
  { value: 'DRONE_ENROUTE_TO_RESTAURANT', label: 'Đang tới nhà hàng' },
  { value: 'DRONE_ARRIVED_RESTAURANT', label: 'Đã tới nhà hàng' },
  { value: 'DRONE_PICKED_FOOD', label: 'Đã lấy hàng' },
  { value: 'DRONE_DELIVERING', label: 'Đang giao' },
  { value: 'DRONE_ARRIVED_CUSTOMER', label: 'Chờ khách xác nhận' },
  { value: 'DRONE_ROUTE_COMPLETE', label: 'Hoàn tất lộ trình' },
  { value: 'PENDING', label: 'Pending (legacy)' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'TAKEOFF', label: 'Takeoff' },
  { value: 'EN_ROUTE_TO_RESTAURANT', label: 'Tới nhà hàng' },
  { value: 'EN_ROUTE_TO_CUSTOMER', label: 'Đang giao' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'RETURNING', label: 'Returning' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'FAILED', label: 'Failed' },
];

const STATUS_LABELS = {
  PENDING: 'Pending',
  WAITING_FOR_DRONE: 'Chờ gán drone',
  DRONE_ASSIGNED: 'Drone đã gán',
  DRONE_ENROUTE_TO_RESTAURANT: 'Drone đang rời hub',
  DRONE_ARRIVED_RESTAURANT: 'Drone đã tới nhà hàng',
  DRONE_PICKED_FOOD: 'Drone đã lấy hàng',
  DRONE_DELIVERING: 'Đang giao cho khách',
  DRONE_ARRIVED_CUSTOMER: 'Chờ khách xác nhận',
  DRONE_ROUTE_COMPLETE: 'Hoàn tất lộ trình',
  ASSIGNED: 'Assigned',
  TAKEOFF: 'Takeoff',
  EN_ROUTE_TO_RESTAURANT: 'Tới nhà hàng',
  EN_ROUTE_TO_CUSTOMER: 'Đang giao',
  DELIVERED: 'Đã giao',
  RETURNING: 'Đang quay về',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Hủy',
  FAILED: 'Lỗi',
};

const statusClass = (value) => {
  switch (value) {
    case 'PENDING':
    case 'WAITING_FOR_DRONE':
      return 'pill waiting';
    case 'ASSIGNED':
    case 'DRONE_ASSIGNED':
    case 'TAKEOFF':
      return 'pill info';
    case 'EN_ROUTE_TO_RESTAURANT':
    case 'EN_ROUTE_TO_CUSTOMER':
    case 'DRONE_ENROUTE_TO_RESTAURANT':
    case 'DRONE_PICKED_FOOD':
    case 'DRONE_DELIVERING':
      return 'pill accent';
    case 'DRONE_ARRIVED_RESTAURANT':
    case 'DRONE_ARRIVED_CUSTOMER':
      return 'pill waiting';
    case 'DRONE_ROUTE_COMPLETE':
      return 'pill success';
    case 'DELIVERED':
    case 'COMPLETED':
      return 'pill success';
    case 'RETURNING':
      return 'pill neutral';
    case 'CANCELLED':
    case 'FAILED':
      return 'pill error';
    default:
      return 'pill';
  }
};

const toOrderKey = (order = {}) => order._id || order.id || order.orderId;

const extractPoint = (raw = {}) => {
  const lat = Number(raw.lat ?? raw.latitude ?? raw.deliveryLat);
  const lng = Number(raw.lng ?? raw.longitude ?? raw.deliveryLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
};

const SuperAdminDroneOrders = () => {
  const [orders, setOrders] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [drones, setDrones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedHubId, setSelectedHubId] = useState('');
  const [selectedDroneId, setSelectedDroneId] = useState('');
  const [autoRoute, setAutoRoute] = useState([]);
  const [routeMeta, setRouteMeta] = useState(null);
  const [actionLoading, setActionLoading] = useState('');
  const [autoSimRunning, setAutoSimRunning] = useState(false);
  const token = getAuthToken(AUTH_ROLES.SUPER_ADMIN);
  const simTimerRef = React.useRef(null);

  // Auth disabled for demo: keep token if available but don't block when absent
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const hasToken = true;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${ORDER_SERVICE_URL}/api/orders`, { headers: authHeaders });
      const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setOrders(list);
      if (!selectedOrderId && list.length) {
        setSelectedOrderId(toOrderKey(list[0]));
      }
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Không thể tải đơn hàng drone');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, hasToken, selectedOrderId]);

  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await axios.get(`${DELIVERY_SERVICE_URL}/api/drone-deliveries`, { headers: authHeaders });
      const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setDeliveries(list);
    } catch (err) {
      // silent
    }
  }, [authHeaders, hasToken]);

  useEffect(() => {
    fetchOrders();
    fetchDeliveries();
  }, [fetchDeliveries, fetchOrders]);

  useEffect(() => {
    if (!selectedHubId && hubOptions.length) {
      setSelectedHubId(hubOptions[0].id);
    }
  }, [hubOptions, selectedHubId]);

  // Polling fallback to mimic realtime if socket layer không sẵn
  useEffect(() => {
    const timer = setInterval(() => {
      fetchOrders();
      fetchDeliveries();
    }, 7000);
    return () => clearInterval(timer);
  }, [fetchDeliveries, fetchOrders]);

  useEffect(() => {
    const fetchHubs = async () => {
      try {
        const res = await axios.get(`${DELIVERY_SERVICE_URL}/api/hubs`);
        const payload = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setHubs(payload);
      } catch (_err) {
        // silent
      }
    };
    const fetchDrones = async () => {
      try {
        const res = await axios.get(`${DELIVERY_SERVICE_URL}/api/drones`);
        const payload = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setDrones(payload);
      } catch (_err) {
        // silent
      }
    };
    fetchHubs();
    fetchDrones();
  }, []);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matchTerm = (value = '') => String(value || '').toLowerCase().includes(term);
    return orders
      .filter(
        (order) =>
          !statusFilter ||
          (order.status || '').toUpperCase() === statusFilter ||
          (order.droneStatus || '').toUpperCase() === statusFilter
      )
      .filter(
        (order) =>
          !term ||
          matchTerm(order._id) ||
          matchTerm(order.orderId) ||
          matchTerm(order.customerId) ||
          matchTerm(order.restaurantId)
      );
  }, [orders, search, statusFilter]);

  const waitingOrders = useMemo(
    () => filteredOrders.filter((o) => (o.droneStatus || o.status || '').toLowerCase() === 'waiting_for_drone'),
    [filteredOrders]
  );
  const inFlightOrders = useMemo(
    () =>
      filteredOrders.filter((o) =>
        ['drone_assigned', 'drone_enroute_to_restaurant', 'drone_arrived_restaurant', 'drone_picked_food', 'drone_delivering', 'drone_arrived_customer'].includes(
          (o.droneStatus || o.status || '').toLowerCase()
        )
      ),
    [filteredOrders]
  );

  const stats = useMemo(() => {
    const total = filteredOrders.length;
    const waiting = waitingOrders.length;
    const delivering = inFlightOrders.length;
    const assigned = filteredOrders.filter(
      (o) => (o.droneStatus || o.status || '').toLowerCase() === 'drone_assigned'
    ).length;
    return { total, waiting, delivering, assigned };
  }, [filteredOrders, inFlightOrders.length, waitingOrders.length]);

  const callAction = async (method, url, body = {}, useOrderService = false) => {
    try {
      setActionLoading(url);
      const res = await axios({
        method,
        url: `${useOrderService ? ORDER_SERVICE_URL : DELIVERY_SERVICE_URL}${url}`,
        data: body,
        headers: authHeaders,
      });
      return res.data;
    } catch (err) {
      setError(err?.response?.data?.message || 'Thao tác thất bại');
      return null;
    } finally {
      setActionLoading('');
    }
  };

  const handleAutoAssign = async (order) => {
    const orderId = toOrderKey(order) || selectedOrderId;
    if (!orderId) return;
    const hubId = selectedHubId || order?.droneHubId || order?.hubId || window.prompt('Nhập hubId (tùy chọn):', order?.hubId || '');
    const result = await callAction('post', '/api/admin/drone/assign', { orderId, hubId }, true);
    if (result) {
      setError('');
      fetchOrders();
      fetchDeliveries();
    }
  };

  const handleAssignSpecific = async (order, droneId) => {
    const orderId = toOrderKey(order);
    if (!orderId || !droneId) return;
    const hubId = selectedHubId || order?.droneHubId || order?.hubId;
    const result = await callAction('post', '/api/admin/drone/assign', { orderId, droneId, hubId }, true);
    if (result) {
      setError('');
      fetchOrders();
      fetchDeliveries();
    }
  };

  const handleUpdateOrderStatus = async (order, step) => {
    const orderId = toOrderKey(order);
    if (!orderId) return;
    const payload = { orderId, droneId: order.droneId || order.drone_id || order.drone };
    if (!payload.droneId) {
      setError('Chưa có droneId để cập nhật trạng thái');
      return;
    }
    let endpoint = '';
    if (step === 'arrived_restaurant') endpoint = '/api/drone/arrived-restaurant';
    if (step === 'picked_food') endpoint = '/api/order/drone-pickup';
    if (step === 'arrived_customer') endpoint = '/api/drone/arrived-customer';
    if (step === 'return') endpoint = '/api/drone/return';
    if (!endpoint) return;
    const result = await callAction('post', endpoint, payload, true);
    if (result) {
      setError('');
      fetchOrders();
    }
  };

  const runAutoFlight = async () => {
    if (!selectedOrder || !selectedOrder.droneId) {
      setError('Chọn đơn và drone trước khi auto bay');
      return;
    }
    if (autoSimRunning) return;
    const orderId = selectedOrder._id || selectedOrder.id;
    const droneId = selectedOrder.droneId;
    let waypoints = routePoints;
    if (!waypoints.length) {
      waypoints = (await handleAutoRoute(orderId, droneId, selectedOrder.droneHubId)) || [];
    }
    if (!waypoints.length) {
      setError('Chưa có tuyến bay để mô phỏng.');
      return;
    }
    setAutoSimRunning(true);
    let index = 0;
    const battery = selectedDrone?.battery ?? 90;
    const postLocation = async (wp) => {
      await axios.post(`${DELIVERY_SERVICE_URL}/api/drone/update-location`, {
        droneId,
        lat: wp.lat,
        lng: wp.lng,
        battery,
        status: 'delivering',
        currentOrderId: orderId,
        hubId: selectedOrder.droneHubId,
      });
    };

    const tick = async () => {
      if (index >= waypoints.length) {
        await handleReturn(orderId, droneId);
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
        setAutoSimRunning(false);
        return;
      }
      const wp = waypoints[index];
      await postLocation(wp);
      // Emit key milestones
      if (index === 1) {
        await handleUpdateOrderStatus(selectedOrder, 'picked_food');
      }
      if (index === waypoints.length - 2) {
        await handleUpdateOrderStatus(selectedOrder, 'arrived_customer');
      }
      index += 1;
    };

    // start
    await tick();
    simTimerRef.current = setInterval(tick, 1500);
  };

  const handleReturn = async (orderId, droneId) => {
    const result = await callAction('post', '/api/drone/return', { orderId, droneId }, true);
    if (result) {
      setError('');
      fetchOrders();
    }
  };

  const handleAutoRoute = async (orderId, droneId, hubId) => {
    if (!orderId) return;
    setRouteMeta(null);
    setAutoRoute([]);
    try {
      const res = await axios.post(
        `${DELIVERY_SERVICE_URL}/api/drone/auto-route`,
        { orderId, droneId, hubId },
        { headers: authHeaders }
      );
      const data = res.data?.data || {};
      const waypoints = Array.isArray(data.waypoints) ? data.waypoints : [];
      setAutoRoute(waypoints);
      setRouteMeta({ distance: data.distanceMeters, eta: data.etaSeconds });
      return waypoints;
    } catch (err) {
      setError(err?.response?.data?.message || 'Không thể tải tuyến bay');
      return [];
    }
  };

  const selectedOrder = useMemo(
    () => filteredOrders.find((o) => toOrderKey(o) === selectedOrderId || String(o.orderId) === String(selectedOrderId)),
    [filteredOrders, selectedOrderId]
  );
  const selectedDelivery = useMemo(
    () => deliveries.find((d) => String(d.orderId) === String(selectedOrderId)),
    [deliveries, selectedOrderId]
  );
  const selectedDrone = useMemo(
    () => (selectedOrder ? drones.find((d) => d.droneId === selectedOrder.droneId) : null),
    [drones, selectedOrder]
  );
  const hubOptions = useMemo(
    () => hubs.map((h) => ({ id: h._id || h.id || h.code, name: h.name || h.code || 'Hub' })),
    [hubs]
  );
  const hubWaitingOrders = useMemo(() => {
    const list = waitingOrders;
    if (!selectedHubId) return list;
    return list.filter((o) => (o.droneHubId || o.hubId || o.hub_id) === selectedHubId);
  }, [selectedHubId, waitingOrders]);
  const hubDrones = useMemo(() => {
    if (!selectedHubId) return drones;
    return drones.filter((d) => (d.hubId || d.hub_id || d.hub) === selectedHubId);
  }, [drones, selectedHubId]);
  const routePoints = useMemo(() => {
    const waypoints =
      selectedDelivery?.route?.waypoints || selectedOrder?.route?.waypoints || autoRoute || selectedDelivery?.routePoints;
    if (Array.isArray(waypoints) && waypoints.length) {
      return waypoints.map((wp) => ({
        lat: wp.lat,
        lng: wp.lng,
        type: wp.type?.toLowerCase(),
        label: wp.type,
      }));
    }
    const fallback = [];
    const hubPt = extractPoint(selectedOrder?.hubLocation || selectedOrder?.droneHubLocation);
    const restaurantPt = extractPoint(
      selectedOrder?.restaurantLocation || selectedOrder?.restaurantAddress || selectedOrder?.restaurant
    );
    const customerPt =
      extractPoint({ lat: selectedOrder?.deliveryLat, lng: selectedOrder?.deliveryLng }) ||
      extractPoint(selectedOrder?.deliveryLocation) ||
      extractPoint(selectedOrder?.customerLocation);
    if (hubPt) fallback.push({ ...hubPt, type: 'hub', label: 'Hub' });
    if (restaurantPt) fallback.push({ ...restaurantPt, type: 'restaurant', label: 'Restaurant' });
    if (customerPt) fallback.push({ ...customerPt, type: 'customer', label: 'Customer' });
    return fallback;
  }, [autoRoute, selectedDelivery, selectedOrder]);

  useEffect(() => {
    if (selectedOrder && selectedOrder.droneId) {
      handleAutoRoute(toOrderKey(selectedOrder), selectedOrder.droneId, selectedOrder.hubId || selectedOrder.droneHubId);
    } else {
      setAutoRoute([]);
      setRouteMeta(null);
    }
  }, [selectedOrder]);

  useEffect(() => () => {
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
  }, []);

  return (
    <div className="drone-orders-shell">
      <header className="drone-orders-hero">
        <div>
          <p className="eyebrow">Control Tower</p>
          <h1>Drone Orders</h1>
          <p className="muted">Giám sát & điều phối toàn bộ đơn giao bằng drone theo thời gian thực.</p>
        </div>
        <div className="hero-filters">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo Order ID, khách, nhà hàng"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {!hasToken && (
        <div className="glass" style={{ padding: 12, marginBottom: 12 }}>
          <strong>Cần đăng nhập Super Admin.</strong>{' '}
          <a href="/super-admin/login" style={{ textDecoration: 'underline' }}>
            Đi tới trang đăng nhập
          </a>{' '}
          hoặc đăng ký tài khoản tại <a href="/super-admin/register">/super-admin/register</a>.
        </div>
      )}

      <section className="drone-orders-metrics">
        <div className="metric-card glass">
          <div className="metric-label">Tổng đơn drone</div>
          <div className="metric-value">{stats.total}</div>
          <div className="metric-sub">Mọi trạng thái liên quan drone</div>
        </div>
        <div className="metric-card glass">
          <div className="metric-label">Chờ gán drone</div>
          <div className="metric-value accent">{stats.waiting}</div>
          <div className="metric-sub">waiting_for_drone</div>
        </div>
        <div className="metric-card glass">
          <div className="metric-label">Đã gán</div>
          <div className="metric-value info">{stats.assigned}</div>
          <div className="metric-sub">drone_assigned</div>
        </div>
        <div className="metric-card glass">
          <div className="metric-label">Đang giao</div>
          <div className="metric-value success">{stats.delivering}</div>
          <div className="metric-sub">Tới NH / KH + returning</div>
        </div>
      </section>

      <section className="glass" style={{ padding: 16, marginBottom: 16, borderRadius: 12 }}>
        <div className="panel-heading" style={{ marginBottom: 12 }}>
          <div>
            <h3>Assign Orders theo Hub</h3>
            <div className="muted">Lọc đơn chờ drone theo hub được gán sẵn</div>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <select value={selectedHubId} onChange={(e) => setSelectedHubId(e.target.value)}>
              <option value="">Tất cả hub</option>
              {hubOptions.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hub.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
          <div className="glass" style={{ padding: 12 }}>
            <div className="flex between" style={{ marginBottom: 8 }}>
              <strong>Đơn chờ gán drone</strong>
              <span className="badge">{hubWaitingOrders.length} đơn</span>
            </div>
            {hubWaitingOrders.length === 0 ? (
              <div className="muted">Không có đơn waiting_for_drone thuộc hub này.</div>
            ) : (
              <div className="assign-order-list">
                {hubWaitingOrders.map((order) => (
                  <div
                    key={toOrderKey(order)}
                    className={`assign-card${selectedOrderId === toOrderKey(order) ? ' active' : ''}`}
                    onClick={() => setSelectedOrderId(toOrderKey(order))}
                    style={{ cursor: 'pointer', padding: 12, borderRadius: 10, border: '1px solid #eee', marginBottom: 8 }}
                  >
                    <div className="flex between">
                      <div>
                        <div className="mono">#{String(toOrderKey(order)).slice(-6)}</div>
                        <div className="muted">
                          KH: {order.customerId || '—'} • NH: {order.restaurantId || '—'}
                        </div>
                        <div className="muted">Hub: {order.droneHubId || '—'}</div>
                      </div>
                      <span className={statusClass((order.status || '').toUpperCase())}>waiting_for_drone</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="glass" style={{ padding: 12 }}>
            <div className="flex between" style={{ marginBottom: 8 }}>
              <strong>Drone trong hub</strong>
              <span className="badge">{hubDrones.length} drone</span>
            </div>
            {hubDrones.length === 0 ? (
              <div className="muted">Chưa có drone thuộc hub này.</div>
            ) : (
              <div className="assign-drone-list">
                {hubDrones.map((drone) => (
                  <div
                    key={drone.droneId}
                    className="flex between"
                    style={{ padding: 10, borderRadius: 10, border: '1px solid #eee', marginBottom: 8 }}
                  >
                    <div>
                      <div className="fw-semibold">{drone.droneId}</div>
                      <div className="muted">
                        {drone.status || '—'} • 🔋 {drone.battery ?? '--'}%
                      </div>
                    </div>
                    <button
                      className="btn primary small"
                      disabled={!selectedOrderId || !hubWaitingOrders.length}
                      onClick={() => {
                        const order =
                          hubWaitingOrders.find((o) => toOrderKey(o) === selectedOrderId) || hubWaitingOrders[0];
                        if (order) handleAssignSpecific(order, drone.droneId);
                      }}
                    >
                      Gán cho đơn
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="drone-orders-panel glass" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12 }}>
        <div>
          <div className="panel-heading">
            <div>
              <h3>Danh sách đơn drone</h3>
              {error && <div className="error-text">{error}</div>}
            </div>
            <div className="pill light">Realtime sync</div>
          </div>

          {loading ? (
            <div className="loading-line">Đang tải...</div>
          ) : (
            <div className="table-wrap">
              <h4 style={{ marginBottom: 8 }}>Đơn chờ gán drone</h4>
              <table className="drone-orders-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Khách/nhà hàng</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {waitingOrders.map((order) => {
                    const key = toOrderKey(order);
                    return (
                      <tr
                        key={key}
                        className={selectedOrderId === key ? 'active' : ''}
                        onClick={() => setSelectedOrderId(key)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className="mono">{order.orderId || order._id}</div>
                          <div className="muted">{order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : ''}</div>
                        </td>
                        <td>
                        <div>{order.customerId || '—'}</div>
                        <div className="muted">{order.restaurantId || '—'}</div>
                      </td>
                      <td>
                        <button className="btn primary small" disabled={!hasToken} onClick={() => handleAutoAssign(order)}>
                          Nhận drone
                        </button>
                      </td>
                    </tr>
                  );
                  })}
                  {!waitingOrders.length && (
                    <tr>
                      <td colSpan={3} className="muted">
                        Không có đơn chờ.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <h4 style={{ margin: '12px 0 8px' }}>Đơn đang bay</h4>
              <table className="drone-orders-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Drone</th>
                    <th>Trạng thái</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {inFlightOrders.map((order) => {
                    const key = toOrderKey(order);
                    const code = (order.droneStatus || order.status || '').toUpperCase();
                    return (
                      <tr
                        key={key}
                        className={selectedOrderId === key ? 'active' : ''}
                        onClick={() => setSelectedOrderId(key)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className="mono">{order.orderId || order._id}</div>
                          <div className="muted">{order.customerId || '—'}</div>
                        </td>
                        <td>{order.droneId || '—'}</td>
                        <td>
                          <span className={statusClass(code)}>
                            {STATUS_LABELS[code] || order.droneStatus || order.status}
                          </span>
                        </td>
                        <td>
                          <button className="btn text small" onClick={() => setSelectedOrderId(key)}>
                            Điều phối
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!inFlightOrders.length && (
                    <tr>
                      <td colSpan={4} className="muted">
                        Chưa có đơn đang bay.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass" style={{ padding: 16, borderRadius: 12 }}>
          {selectedOrder ? (
            <>
              <div className="flex between" style={{ alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div className="mono">{selectedOrder.orderId || selectedOrder._id}</div>
                  <div className="muted">
                    {selectedOrder.customerId || '—'} • {selectedOrder.restaurantId || '—'}
                  </div>
                  <div className="muted">
                    Hub: {selectedOrder.hubId || selectedOrder.droneHubId || '—'}
                  </div>
                </div>
                {(() => {
                  const code = (selectedOrder.droneStatus || selectedOrder.status || '').toUpperCase();
                  return (
                    <span className={statusClass(code)}>
                      {STATUS_LABELS[code] || selectedOrder.droneStatus || selectedOrder.status}
                    </span>
                  );
                })()}
              </div>

              <div className="chip-row" style={{ marginBottom: 10, gap: 6 }}>
                <span className="pill ghost">Drone: {selectedOrder.droneId || '—'}</span>
                <span className="pill ghost">Hub: {selectedOrder.hubId || selectedOrder.droneHubId || '—'}</span>
              </div>

              <div className="action-group" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <button
                  className="btn primary small"
                  disabled={actionLoading === '/api/admin/drone/assign'}
                  onClick={() => handleAutoAssign(selectedOrder)}
                >
                  {actionLoading === '/api/admin/drone/assign' ? 'Đang gán...' : 'Nhận đơn (auto)'}
                </button>
                <button
                  className="btn ghost small"
                  disabled={!selectedOrder.droneId}
                  onClick={() => handleUpdateOrderStatus(selectedOrder, 'arrived_restaurant')}
                >
                  Đánh dấu tới nhà hàng
                </button>
                <button
                  className="btn ghost small"
                  disabled={!selectedOrder.droneId}
                  onClick={() => handleUpdateOrderStatus(selectedOrder, 'picked_food')}
                >
                  Nhà hàng đã chất hàng
                </button>
                <button
                  className="btn ghost small"
                  disabled={!selectedOrder.droneId}
                  onClick={() => handleUpdateOrderStatus(selectedOrder, 'arrived_customer')}
                >
                  Tới khách / chờ xác nhận
                </button>
                <button
                  className="btn ghost small"
                  disabled={!selectedOrder.droneId}
                  onClick={() => handleUpdateOrderStatus(selectedOrder, 'return')}
                >
                  Cho drone về hub
                </button>
                <button
                  className="btn primary small"
                  disabled={autoSimRunning}
                  onClick={runAutoFlight}
                  title="Mô phỏng bay tự động giống simulator"
                >
                  {autoSimRunning ? 'Đang bay mô phỏng...' : 'Auto bay (simulate)'}
                </button>
              </div>

              <div className="glass" style={{ padding: 12, marginBottom: 12 }}>
                <div className="flex between" style={{ marginBottom: 6 }}>
                  <strong>Tuyến bay</strong>
                  <button
                    className="btn text small"
                    disabled={!selectedOrder.droneId}
                    onClick={() =>
                      handleAutoRoute(
                        toOrderKey(selectedOrder),
                        selectedOrder.droneId,
                        selectedOrder.hubId || selectedOrder.droneHubId
                      )
                    }
                  >
                    Load auto-route
                  </button>
                </div>
                {routeMeta && (
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Distance: {routeMeta.distance ? `${Math.round(routeMeta.distance / 10) / 100} km` : '--'} • ETA:{' '}
                    {routeMeta.eta ? `${Math.round(routeMeta.eta / 60)} phút` : '--'}
                  </div>
                )}
                <DroneMapCanvas
                  drones={
                    selectedDrone
                      ? [
                          {
                            ...selectedDrone,
                            location: selectedDrone.location || { lat: selectedDrone.lat, lng: selectedDrone.lng },
                          },
                        ]
                      : []
                  }
                  hubs={hubs}
                  focusDroneId={selectedOrder.droneId}
                  routePoints={routePoints}
                  height={300}
                />
              </div>
            </>
          ) : (
            <div className="muted">Chọn đơn để điều phối.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDroneOrders;
