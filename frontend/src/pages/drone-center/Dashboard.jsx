import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useDroneCenter } from './DroneCenterContext';
import DroneMapCanvas from './components/DroneMapCanvas';
import { ORDER_SERVICE_URL } from '../../utils/serviceUrls';
import { AUTH_ROLES, getAuthToken } from '../../utils/authTokens';

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '—';
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 1000) return 'vừa xong';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s trước`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  return `${hours} giờ trước`;
};

const Dashboard = () => {
  const { drones, stats, events, hubs, deliveries } = useDroneCenter();
  const [orderQueue, setOrderQueue] = useState([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [actionOrderId, setActionOrderId] = useState('');

  const orderHeaders = useMemo(() => {
    const token = getAuthToken(AUTH_ROLES.SUPER_ADMIN) || getAuthToken(AUTH_ROLES.ADMIN);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchOrderQueue = useCallback(async () => {
    setOrderLoading(true);
    try {
      const res = await axios.get(`${ORDER_SERVICE_URL}/api/drone/orders-queue`, { headers: orderHeaders });
      const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.data) ? res.data.data : [];
      setOrderQueue(list);
      setOrderError('');
    } catch (err) {
      setOrderError(err?.response?.data?.message || 'Không tải được hàng đợi drone');
      setOrderQueue([]);
    } finally {
      setOrderLoading(false);
    }
  }, [orderHeaders]);

  useEffect(() => {
    fetchOrderQueue();
    const timer = setInterval(fetchOrderQueue, 12000);
    return () => clearInterval(timer);
  }, [fetchOrderQueue]);

  const waitingOrders = useMemo(
    () => orderQueue.filter((order) => (order.droneStatus || order.status || '').toLowerCase() === 'waiting_for_drone'),
    [orderQueue]
  );
  const activeOrders = useMemo(
    () =>
      orderQueue.filter((order) =>
        [
          'drone_assigned',
          'drone_arriving_restaurant',
          'drone_enroute_to_restaurant',
          'drone_arrived_restaurant',
          'drone_picked_food',
          'drone_arriving_customer',
          'drone_delivering',
          'drone_arrived_customer',
          'returning',
        ].includes(
          (order.droneStatus || order.status || '').toLowerCase()
        )
      ),
    [orderQueue]
  );

  const lowBattery = stats?.lowBatteryList || [];
  const offline = stats?.offlineList || [];

  const criticalDrones = useMemo(
    () => drones.filter((drone) => drone.offline || (drone.battery ?? 100) < 30),
    [drones]
  );

  const handleAssignOrder = async (order) => {
    if (!order) return;
    const orderId = order._id || order.id || order.orderId;
    setActionOrderId(orderId);
    try {
      await axios.post(
        `${ORDER_SERVICE_URL}/api/admin/drone/assign`,
        { orderId, hubId: order.droneHubId || order.hubId },
        { headers: orderHeaders }
      );
      fetchOrderQueue();
    } catch (err) {
      setOrderError(err?.response?.data?.message || 'Không gán được drone');
    } finally {
      setActionOrderId('');
    }
  };

  const handleStageUpdate = async (order, endpoint) => {
    if (!order) return;
    const orderId = order._id || order.id || order.orderId;
    const droneId = order.droneId;
    if (!droneId) {
      setOrderError('Thiếu droneId cho đơn này.');
      return;
    }
    setActionOrderId(orderId);
    try {
      await axios.post(`${ORDER_SERVICE_URL}${endpoint}`, { orderId, droneId }, { headers: orderHeaders });
      fetchOrderQueue();
    } catch (err) {
      setOrderError(err?.response?.data?.message || 'Không cập nhật được trạng thái');
    } finally {
      setActionOrderId('');
    }
  };

  const formatStage = (order) => {
    const status = (order.droneStatus || order.status || '').toLowerCase();
    switch (status) {
      case 'waiting_for_drone':
        return 'Chờ gán drone';
      case 'drone_assigned':
        return 'Drone đang rời hub';
      case 'drone_enroute_to_restaurant':
        return 'Đến nhà hàng';
      case 'drone_arrived_restaurant':
        return 'Đã tới nhà hàng';
      case 'drone_picked_food':
        return 'Đã lấy hàng';
      case 'drone_delivering':
        return 'Đang giao';
      case 'drone_arrived_customer':
        return 'Chờ khách xác nhận';
      default:
        return order.status || '—';
    }
  };

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Tổng số drone</div>
          <div className="value">{stats?.totals?.total ?? 0}</div>
          <div className="sub">Tất cả hub</div>
        </div>
        <div className="stat-card">
          <div className="label">Drone đang bay</div>
          <div className="value">{stats?.totals?.flying ?? 0}</div>
          <div className="sub">Assigned / delivering</div>
        </div>
        <div className="stat-card">
          <div className="label">Drone idle</div>
          <div className="value">{stats?.totals?.idle ?? 0}</div>
          <div className="sub">Sẵn sàng nhận tuyến</div>
        </div>
        <div className="stat-card">
          <div className="label">Drone returning</div>
          <div className="value">{stats?.totals?.returning ?? 0}</div>
          <div className="sub">Đang quay về hub</div>
        </div>
        <div className="stat-card">
          <div className="label">Drone offline (&gt;10s)</div>
          <div className="value">{stats?.totals?.offline ?? 0}</div>
          <div className="sub">Không nhận tín hiệu</div>
        </div>
        <div className="stat-card">
          <div className="label">Pin thấp (&lt;30%)</div>
          <div className="value">{stats?.totals?.lowBattery ?? 0}</div>
          <div className="sub">Cảnh báo sớm</div>
        </div>
      </div>

      <div className="panel">
        <h2>Realtime Overview</h2>
        <DroneMapCanvas
          drones={drones}
          hubs={hubs}
          routePoints={
            deliveries.find((d) => Array.isArray(d.route?.waypoints) && d.route.waypoints.length >= 3)?.route?.waypoints?.map((wp) => ({
              lat: wp.lat,
              lng: wp.lng,
              type: wp.type?.toLowerCase(),
              label: wp.type,
            })) || []
          }
        />
        <div className="map-legend">
          <div className="legend-item">
            <span className="marker-dot drone" />
            Drone
          </div>
          <div className="legend-item">
            <span className="marker-dot hub" />
            Hub
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="flex between">
          <h3>Hàng đợi đơn drone</h3>
          <span className="badge">{waitingOrders.length} chờ nhận</span>
        </div>
        {orderError && <div className="error-text">{orderError}</div>}
        {orderLoading ? (
          <div className="loading-line">Đang tải đơn...</div>
        ) : (
          <div className="table-wrap">
            <table className="drone-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Khách</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...waitingOrders, ...activeOrders].slice(0, 10).map((order) => {
                  const key = order._id || order.id || order.orderId;
                  const isWaiting = (order.droneStatus || order.status || '').toLowerCase() === 'waiting_for_drone';
                  return (
                    <tr key={key}>
                      <td>
                        <div className="mono">{order.orderId || key}</div>
                        <div className="text-muted">{order.restaurantId || '—'}</div>
                      </td>
                      <td>{order.customerId || '—'}</td>
                      <td>
                        <span className={`pill ${isWaiting ? 'waiting' : 'flying'}`}>{formatStage(order)}</span>
                      </td>
                      <td>
                        {isWaiting ? (
                          <button
                            className="btn primary small"
                            disabled={actionOrderId === key}
                            onClick={() => handleAssignOrder(order)}
                          >
                            {actionOrderId === key ? 'Đang gán...' : 'Nhận đơn'}
                          </button>
                        ) : (
                          <div className="flex" style={{ gap: 6 }}>
                            <button
                              className="btn ghost small"
                              disabled={actionOrderId === key}
                              onClick={() => handleStageUpdate(order, '/api/drone/arrived-restaurant')}
                            >
                              Tới NH
                            </button>
                            <button
                              className="btn ghost small"
                              disabled={actionOrderId === key}
                              onClick={() => handleStageUpdate(order, '/api/order/drone-pickup')}
                            >
                              Đã lấy
                            </button>
                            <button
                              className="btn ghost small"
                              disabled={actionOrderId === key}
                              onClick={() => handleStageUpdate(order, '/api/drone/arrived-customer')}
                            >
                              Đến KH
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {[...waitingOrders, ...activeOrders].length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-muted">
                      Chưa có đơn drone nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex" style={{ gap: 16, flexWrap: 'wrap' }}>
        <div className="panel" style={{ flex: '1 1 320px' }}>
          <div className="flex between">
            <h3>Pin thấp (&lt; 30%)</h3>
            <span className="badge">{lowBattery.length} drone</span>
          </div>
          {lowBattery.length === 0 ? (
            <div className="text-muted">Không có cảnh báo pin.</div>
          ) : (
            <ul className="list">
              {lowBattery.map((drone) => (
                <li key={drone.droneId} className="list-item flex between">
                  <div>
                    <strong>{drone.name}</strong>
                    <div className="text-muted">
                      {drone.droneId} • Hub {drone.hubId || '—'}
                    </div>
                  </div>
                  <span className="pill low">🔋 {drone.battery}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel" style={{ flex: '1 1 320px' }}>
          <div className="flex between">
            <h3>Offline (&gt; 10s)</h3>
            <span className="badge">{offline.length} drone</span>
          </div>
          {offline.length === 0 ? (
            <div className="text-muted">Không có drone offline.</div>
          ) : (
            <ul className="list">
              {offline.map((drone) => (
                <li key={drone.droneId} className="list-item flex between">
                  <div>
                    <strong>{drone.name}</strong>
                    <div className="text-muted">
                      {drone.droneId} • lần cuối {formatTimeAgo(drone.updatedAt)}
                    </div>
                  </div>
                  <span className="pill offline">🚫 Offline</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel" style={{ flex: '1 1 320px' }}>
          <div className="flex between">
            <h3>Sự kiện mới nhất</h3>
            <span className="badge">{events.length} cập nhật</span>
          </div>
          {events.length === 0 ? (
            <div className="text-muted">Chưa có dữ liệu realtime.</div>
          ) : (
            <ul className="timeline">
              {events.slice(0, 6).map((evt, index) => (
                <li key={`${evt.droneId}-${index}`} className="timeline-item">
                  <div className="flex between">
                    <strong>{evt.droneId}</strong>
                    <span className="text-muted">{formatTimeAgo(evt.timestamp)}</span>
                  </div>
                  <div className="text-muted">
                    {evt.type} • {evt.location?.lat?.toFixed ? evt.location.lat.toFixed(4) : '—'},
                    {evt.location?.lng?.toFixed ? ` ${evt.location.lng.toFixed(4)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="flex between">
          <h3>Giám sát nhanh</h3>
          <span className="badge">Realtime heartbeat</span>
        </div>
        <div className="table-wrap">
          <table className="drone-table">
            <thead>
              <tr>
                <th>Drone</th>
                <th>Status</th>
                <th>Pin</th>
                <th>Hub</th>
                <th>Lần cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {criticalDrones.map((drone) => (
                <tr key={drone.droneId}>
                  <td>
                    <div>{drone.name}</div>
                    <div className="text-muted">{drone.droneId}</div>
                  </td>
                  <td>
                    <span className={`pill ${drone.offline ? 'offline' : 'flying'}`}>
                      {drone.offline ? 'Offline' : drone.status || '—'}
                    </span>
                  </td>
                  <td>
                    <span className="pill-battery">🔋 {drone.battery ?? '--'}%</span>
                  </td>
                  <td>{drone.hubId || '—'}</td>
                  <td className="text-muted">{formatTimeAgo(drone.updatedAt)}</td>
                </tr>
              ))}
              {criticalDrones.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Không có cảnh báo. Tất cả drone ổn định.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default Dashboard;

