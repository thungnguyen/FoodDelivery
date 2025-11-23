import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ORDER_SERVICE_URL, DELIVERY_SERVICE_URL } from '../../../utils/serviceUrls';
import { getAuthToken, AUTH_ROLES } from '../../../utils/authTokens';
import '../styles/dashboard.css';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const token = getAuthToken(AUTH_ROLES.SUPER_ADMIN);

  useEffect(() => {
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
        setError('');
      } catch (err) {
        setError('Không thể tải đơn drone');
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [statusFilter, token]);

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
      const res = await axios.post(`${DELIVERY_SERVICE_URL}${path}`, body, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.data;
    } catch (err) {
      setError(err?.response?.data?.message || 'Thao tác thất bại');
      return null;
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

      <div className="drone-orders-panel glass">
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
                  <th>Nhà hàng</th>
                  <th>Drone</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <div className="mono">{order._id}</div>
                      <div className="muted">Total: {order.totalPrice || '--'} </div>
                    </td>
                    <td>
                      <div>{order.customerName || order.customerId}</div>
                      <div className="muted">{order.customerPhone}</div>
                    </td>
                    <td>
                      <div>{order.restaurantName || order.restaurantId}</div>
                      <div className="muted">{order.deliveryAddress}</div>
                    </td>
                    <td>{order.droneId || '—'}</td>
                    <td>
                      <span className={statusClass(order.droneStatus || order.status)}>
                        {STATUS_LABELS[order.droneStatus] || order.droneStatus || order.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-group">
                        <button className="btn primary small" onClick={() => handleAssign(order._id)}>
                          Force Assign
                        </button>
                        <button className="btn ghost small" onClick={() => handleForceReturn(order._id, order.droneId)}>
                          Force Return
                        </button>
                        <button className="btn text small" onClick={() => handleCancelDrone(order._id)}>
                          Cancel Drone
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredOrders.length && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Chưa có đơn drone.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminDroneOrders;
