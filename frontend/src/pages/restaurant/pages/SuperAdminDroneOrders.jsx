import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ORDER_SERVICE_URL, DELIVERY_SERVICE_URL } from '../../../utils/serviceUrls';
import { getAuthToken, AUTH_ROLES } from '../../../utils/authTokens';
import DroneMapCanvas from '../../drone-center/components/DroneMapCanvas';
import '../styles/dashboard.css';

const addLeafletAssets = () => {
  if (typeof document === 'undefined') return;
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

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'waiting_for_drone', label: 'Waiting for drone' },
  { value: 'drone_assigned', label: 'Drone assigned' },
  { value: 'drone_enroute_to_restaurant', label: 'Enroute to restaurant' },
  { value: 'drone_arrived_restaurant', label: 'Arrived restaurant' },
  { value: 'drone_picked_food', label: 'Picked food' },
  { value: 'drone_delivering', label: 'Delivering' },
  { value: 'drone_arrived_customer', label: 'Arrived customer' },
];

const STATUS_LABELS = {
  waiting_for_drone: 'Waiting',
  drone_assigned: 'Assigned',
  drone_enroute_to_restaurant: 'Enroute to restaurant',
  drone_arrived_restaurant: 'Arrived restaurant',
  drone_picked_food: 'Picked food',
  drone_delivering: 'Delivering',
  drone_arrived_customer: 'Arrived customer',
};

const statusClass = (value) => {
  switch (value) {
    case 'waiting_for_drone':
      return 'pill waiting';
    case 'drone_assigned':
      return 'pill info';
    case 'drone_enroute_to_restaurant':
      return 'pill accent';
    case 'drone_arrived_restaurant':
      return 'pill success';
    case 'drone_picked_food':
      return 'pill success';
    case 'drone_delivering':
      return 'pill primary';
    case 'drone_arrived_customer':
      return 'pill neutral';
    default:
      return 'pill';
  }
};

const SuperAdminDroneOrders = () => {
  const [orders, setOrders] = useState([]);
  const [drones, setDrones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [autoRoute, setAutoRoute] = useState([]);
  const [routeMeta, setRouteMeta] = useState(null);
  const [actionLoading, setActionLoading] = useState('');
  const token = getAuthToken(AUTH_ROLES.SUPER_ADMIN);

  useEffect(() => {
    addLeafletAssets();
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${ORDER_SERVICE_URL}/api/orders`, {
          params: statusFilter ? { status: statusFilter } : {},
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const list = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.orders)
          ? response.data.orders
          : response.data?.data || [];
        setOrders(list);
        if (!selectedOrderId && list.length) {
          setSelectedOrderId(list[0]._id || list[0].id);
        } else if (selectedOrderId && list.length && !list.find((o) => (o._id || o.id) === selectedOrderId)) {
          setSelectedOrderId(list[0]._id || list[0].id);
        }
        setError('');
      } catch (err) {
        setError('Không thể tải đơn drone');
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [statusFilter, token, selectedOrderId]);

  useEffect(() => {
    const fetchDrones = async () => {
      try {
        const res = await axios.get(`${DELIVERY_SERVICE_URL}/api/drones`);
        const payload = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setDrones(payload);
      } catch (err) {
        // silent
      }
    };
    fetchDrones();
  }, []);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders
      .filter((order) => !statusFilter || order.status === statusFilter || order.droneStatus === statusFilter)
      .filter(
        (order) =>
          !term ||
          (order._id || '').toLowerCase().includes(term) ||
          (order.customerName || '').toLowerCase().includes(term) ||
          (order.restaurantName || '').toLowerCase().includes(term)
      );
  }, [orders, search, statusFilter]);

  const stats = useMemo(() => {
    const total = orders.length;
    const waiting = orders.filter((o) => o.droneStatus === 'waiting_for_drone').length;
    const delivering = orders.filter((o) => ['drone_delivering', 'drone_arrived_customer'].includes(o.droneStatus)).length;
    const assigned = orders.filter((o) => o.droneStatus === 'drone_assigned').length;
    return { total, waiting, delivering, assigned };
  }, [orders]);

  const callAction = async (path, body = {}) => {
    try {
      setActionLoading(path);
      const res = await axios.post(`${DELIVERY_SERVICE_URL}${path}`, body, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.data;
    } catch (err) {
      setError(err?.response?.data?.message || 'Thao tác thất bại');
      return null;
    } finally {
      setActionLoading('');
    }
  };

  const handleAssign = async (orderId) => {
    const result = await callAction('/api/admin/drone/assign', { orderId });
    if (result) {
      setError('');
    }
  };

  const handleForceReturn = async (orderId, droneId) => {
    const result = await callAction('/api/admin/drone-force-return', { orderId, droneId });
    if (result) {
      setError('');
    }
  };

  const handleCancelDrone = async (orderId) => {
    const result = await callAction('/api/admin/drone-cancel', { orderId });
    if (result) {
      setError('');
    }
  };

  const handleArrivedRestaurant = async (orderId, droneId) => {
    const result = await callAction('/api/drone/arrived-restaurant', { orderId, droneId });
    if (result) setError('');
  };

  const handlePickup = async (orderId, droneId) => {
    const result = await callAction('/api/order/drone-pickup', { orderId, droneId });
    if (result) setError('');
  };

  const handleArrivedCustomer = async (orderId, droneId) => {
    const result = await callAction('/api/drone/arrived-customer', { orderId, droneId });
    if (result) setError('');
  };

  const handleReturn = async (orderId, droneId) => {
    const result = await callAction('/api/drone/return', { orderId, droneId });
    if (result) setError('');
  };

  const handleAutoRoute = async (orderId, droneId, hubId) => {
    if (!orderId) return;
    setRouteMeta(null);
    setAutoRoute([]);
    try {
      const res = await axios.post(
        `${DELIVERY_SERVICE_URL}/api/drone/auto-route`,
        { orderId, droneId, hubId },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const data = res.data?.data || {};
      const waypoints = Array.isArray(data.waypoints) ? data.waypoints : [];
      setAutoRoute(waypoints);
      setRouteMeta({ distance: data.distanceMeters, eta: data.etaSeconds });
    } catch (err) {
      setError(err?.response?.data?.message || 'Không thể tải tuyến bay');
    }
  };

  const selectedOrder = useMemo(
    () => filteredOrders.find((o) => (o._id || o.id) === selectedOrderId),
    [filteredOrders, selectedOrderId]
  );
  const selectedDrone = useMemo(
    () => (selectedOrder ? drones.find((d) => d.droneId === selectedOrder.droneId) : null),
    [drones, selectedOrder]
  );
  const routePoints = useMemo(() => autoRoute || [], [autoRoute]);

  useEffect(() => {
    if (selectedOrder && selectedOrder.droneId) {
      handleAutoRoute(selectedOrder._id || selectedOrder.id, selectedOrder.droneId, selectedOrder.droneHubId);
    } else {
      setAutoRoute([]);
      setRouteMeta(null);
    }
  }, [selectedOrder]);

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

      <section className="drone-orders-metrics">
        <div className="metric-card glass">
          <div className="metric-label">Tổng đơn drone</div>
          <div className="metric-value">{stats.total}</div>
          <div className="metric-sub">Mọi trạng thái</div>
        </div>
        <div className="metric-card glass">
          <div className="metric-label">Chờ gán drone</div>
          <div className="metric-value accent">{stats.waiting}</div>
          <div className="metric-sub">Trạng thái waiting_for_drone</div>
        </div>
        <div className="metric-card glass">
          <div className="metric-label">Đã gán</div>
          <div className="metric-value info">{stats.assigned}</div>
          <div className="metric-sub">drone_assigned</div>
        </div>
        <div className="metric-card glass">
          <div className="metric-label">Đang giao</div>
          <div className="metric-value success">{stats.delivering}</div>
          <div className="metric-sub">drone_delivering / arrived_customer</div>
        </div>
      </section>

      <div className="drone-orders-panel glass" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
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
              <table className="drone-orders-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Khách</th>
                    <th>Drone</th>
                    <th>Trạng thái</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr
                      key={order._id}
                      className={selectedOrderId === (order._id || order.id) ? 'active' : ''}
                      onClick={() => setSelectedOrderId(order._id || order.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div className="mono">{order._id}</div>
                        <div className="muted">{order.deliveryAddress}</div>
                      </td>
                      <td>
                        <div>{order.customerName || order.customerId}</div>
                        <div className="muted">{order.customerPhone}</div>
                      </td>
                      <td>{order.droneId || '—'}</td>
                      <td>
                        <span className={statusClass(order.droneStatus || order.status)}>
                          {STATUS_LABELS[order.droneStatus] || order.droneStatus || order.status}
                        </span>
                      </td>
                      <td>
                        <button className="btn text small" onClick={() => handleAssign(order._id)}>
                          Force assign
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filteredOrders.length && (
                    <tr>
                      <td colSpan={5} className="muted">
                        Chưa có đơn drone.
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
                  <div className="mono">{selectedOrder._id}</div>
                  <div className="muted">
                    {selectedOrder.customerName || selectedOrder.customerId} • {selectedOrder.restaurantName || selectedOrder.restaurantId}
                  </div>
                </div>
                <span className={statusClass(selectedOrder.droneStatus || selectedOrder.status)}>
                  {STATUS_LABELS[selectedOrder.droneStatus] || selectedOrder.droneStatus || selectedOrder.status}
                </span>
              </div>

              <div className="chip-row" style={{ marginBottom: 10, gap: 6 }}>
                <span className="pill ghost">Drone: {selectedOrder.droneId || '—'}</span>
                <span className="pill ghost">Hub: {selectedOrder.droneHubId || '—'}</span>
              </div>

              <div className="action-group" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <button
                  className="btn primary small"
                  disabled={actionLoading === '/api/admin/drone/assign'}
                  onClick={() => handleAssign(selectedOrder._id)}
                >
                  {actionLoading === '/api/admin/drone/assign' ? 'Đang gán...' : 'Gán drone'}
                </button>
                <button
                  className="btn ghost small"
                  disabled={!selectedOrder.droneId}
                  onClick={() => handleArrivedRestaurant(selectedOrder._id, selectedOrder.droneId)}
                >
                  Đã tới nhà hàng
                </button>
                <button
                  className="btn ghost small"
                  disabled={!selectedOrder.droneId}
                  onClick={() => handlePickup(selectedOrder._id, selectedOrder.droneId)}
                >
                  Đã lấy hàng
                </button>
                <button
                  className="btn ghost small"
                  disabled={!selectedOrder.droneId}
                  onClick={() => handleArrivedCustomer(selectedOrder._id, selectedOrder.droneId)}
                >
                  Đã tới khách
                </button>
                <button
                  className="btn ghost small"
                  disabled={!selectedOrder.droneId}
                  onClick={() => handleReturn(selectedOrder._id, selectedOrder.droneId)}
                >
                  Return hub
                </button>
                <button
                  className="btn text small"
                  disabled={!selectedOrder.droneId}
                  onClick={() => handleForceReturn(selectedOrder._id, selectedOrder.droneId)}
                >
                  Force Return
                </button>
                <button className="btn text small" onClick={() => handleCancelDrone(selectedOrder._id)}>
                  Cancel Drone
                </button>
              </div>

              <div className="glass" style={{ padding: 12, marginBottom: 12 }}>
                  <div className="flex between" style={{ marginBottom: 6 }}>
                    <strong>Tuyến bay</strong>
                    <button
                      className="btn text small"
                    disabled={!selectedOrder.droneId}
                    onClick={() => handleAutoRoute(selectedOrder._id, selectedOrder.droneId, selectedOrder.droneHubId)}
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
                  hubs={[]}
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
