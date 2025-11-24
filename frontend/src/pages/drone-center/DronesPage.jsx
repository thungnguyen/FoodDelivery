import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import DroneMapCanvas from './components/DroneMapCanvas';
import { useDroneCenter } from './DroneCenterContext';

const formatTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleTimeString()} · ${date.toLocaleDateString()}`;
};

const statusClass = (status) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'idle') return 'idle';
  if (normalized === 'returning') return 'returning';
  if (normalized === 'picking' || normalized === 'drone_arrived_restaurant') return 'idle';
  return 'flying';
};

const STAGES = ['idle', 'enroute_restaurant', 'waiting_pickup', 'delivering', 'awaiting_customer', 'returning'];
const STAGE_LABELS = {
  idle: 'Sẵn sàng / Không có đơn',
  enroute_restaurant: 'Đang đến nhà hàng',
  waiting_pickup: 'Chờ nhà hàng chất hàng',
  delivering: 'Đang giao cho khách',
  awaiting_customer: 'Chờ khách xác nhận',
  returning: 'Đang quay về hub',
};

const mapStage = (status, events = []) => {
  const normalized = (status || '').toLowerCase();
  if (events.some((evt) => evt.type === 'drone_route_complete')) return 'returning';
  if (events.some((evt) => evt.type === 'customer_wait_confirm' || evt.status === 'drone_arrived_customer')) {
    return 'awaiting_customer';
  }
  if (
    normalized === 'delivering' ||
    normalized === 'drone_delivering' ||
    events.some((evt) => evt.type === 'drone_waypoint_update' && evt.waypoint === 'restaurant_pickup')
  ) {
    return 'delivering';
  }
  if (
    normalized === 'picking' ||
    normalized === 'drone_arrived_restaurant' ||
    events.some((evt) => evt.type === 'restaurant_wait_pickup')
  ) {
    return 'waiting_pickup';
  }
  if (normalized === 'assigned' || normalized === 'drone_assigned' || normalized === 'drone_enroute_to_restaurant') {
    return 'enroute_restaurant';
  }
  if (normalized === 'returning') return 'returning';
  return 'idle';
};

const normalizeRoutePoints = (waypoints = []) =>
  waypoints
    .map((pt, idx) => {
      const lat = Number(pt.lat);
      const lng = Number(pt.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        lat,
        lng,
        type: pt.type || (idx === 0 ? 'hub' : idx === waypoints.length - 1 ? 'hub' : 'waypoint'),
        label:
          pt.type === 'restaurant'
            ? 'Nhà hàng'
            : pt.type === 'customer'
            ? 'Khách hàng'
            : pt.type === 'hub'
            ? 'Hub'
            : `Điểm ${idx + 1}`,
      };
    })
    .filter(Boolean);

const DronesPage = () => {
  const { drones, hubs, apiBase, refreshDrones, events, stats } = useDroneCenter();
  const [query, setQuery] = useState('');
  const [activatingId, setActivatingId] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [orderInput, setOrderInput] = useState('');
  const [routePreview, setRoutePreview] = useState([]);
  const [routeMeta, setRouteMeta] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const hubLookup = useMemo(
    () => Object.fromEntries(hubs.map((hub) => [hub.id || hub.name, hub.name])),
    [hubs]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drones;
    return drones.filter(
      (drone) =>
        drone.name?.toLowerCase().includes(q) ||
        drone.droneId?.toLowerCase().includes(q) ||
        drone.hubId?.toLowerCase().includes(q)
    );
  }, [drones, query]);

  useEffect(() => {
    if (!selectedId && filtered.length) {
      setSelectedId(filtered[0].droneId);
    } else if (selectedId && filtered.every((drone) => drone.droneId !== selectedId) && filtered.length) {
      setSelectedId(filtered[0].droneId);
    }
  }, [filtered, selectedId]);

  const selected = useMemo(
    () => drones.find((drone) => drone.droneId === selectedId) || filtered[0] || null,
    [drones, filtered, selectedId]
  );

  useEffect(() => {
    setRoutePreview([]);
    setRouteMeta(null);
    if (selected?.currentOrderId) {
      setOrderInput(String(selected.currentOrderId));
    } else {
      setOrderInput('');
    }
  }, [selected?.droneId]);

  const orderEvents = useMemo(() => {
    if (!selected) return [];
    const orderId = selected.currentOrderId;
    return events.filter(
      (evt) => evt.droneId === selected.droneId || (orderId && evt.orderId && evt.orderId === orderId)
    );
  }, [events, selected]);

  const latestRouteEvent = useMemo(
    () => orderEvents.find((evt) => evt.type === 'order_auto_route_loaded' && Array.isArray(evt.waypoints)),
    [orderEvents]
  );

  const routePoints = useMemo(() => {
    if (routePreview.length) return routePreview;
    if (latestRouteEvent?.waypoints?.length) {
      return normalizeRoutePoints(latestRouteEvent.waypoints);
    }
    if (selected?.location && hubs.length) {
      const hub = hubs.find((h) => h.id === selected.hubId) || hubs[0];
      const points = [];
      if (hub?.location) {
        points.push({ ...hub.location, type: 'hub', label: hub.name || 'Hub' });
      }
      points.push({ ...selected.location, type: 'drone', label: selected.droneId });
      return points;
    }
    if (selected?.location) {
      return [{ ...selected.location, type: 'drone', label: selected.droneId }];
    }
    return [];
  }, [hubs, latestRouteEvent, routePreview, selected]);

  const currentStage = useMemo(
    () => mapStage(selected?.status, orderEvents),
    [orderEvents, selected?.status]
  );
  const stageIndex = STAGES.indexOf(currentStage);

  const wakeDrone = async (drone) => {
    if (!drone?.droneId) return;
    setActivatingId(drone.droneId);
    setActionError('');
    try {
      await axios.post(`${apiBase}/api/drone/update-location`, {
        droneId: drone.droneId,
        lat: drone.location?.lat ?? 0,
        lng: drone.location?.lng ?? 0,
        battery: typeof drone.battery === 'number' ? drone.battery : 90,
        status: 'idle',
        hubId: drone.hubId,
        currentOrderId: null,
      });
      await refreshDrones();
    } catch (err) {
      const message = err?.response?.data?.message || 'Không thể chuyển drone sang trạng thái idle';
      setActionError(message);
    } finally {
      setActivatingId('');
    }
  };

  const handleLoadRoute = async () => {
    if (!selected?.droneId) {
      setActionError('Chọn drone cần xem tuyến bay.');
      return;
    }
    if (!orderInput.trim()) {
      setActionError('Nhập Order ID để dựng tuyến bay tự động.');
      return;
    }
    setRouteLoading(true);
    setActionError('');
    try {
      const response = await axios.post(`${apiBase}/api/drone/auto-route`, {
        orderId: orderInput.trim(),
        droneId: selected.droneId,
        hubId: selected.hubId,
      });
      const payload = response.data?.data || response.data || {};
      const waypoints = normalizeRoutePoints(payload.waypoints || []);
      if (waypoints.length) {
        setRoutePreview(waypoints);
        setRouteMeta({
          distanceMeters: payload.distanceMeters,
          etaSeconds: payload.etaSeconds,
        });
      } else {
        setActionError('Không tìm thấy waypoint hợp lệ từ API auto-route.');
      }
    } catch (err) {
      const message = err?.response?.data?.message || 'Không thể dựng tuyến bay tự động';
      setActionError(message);
    } finally {
      setRouteLoading(false);
    }
  };

  const googleMapsLink =
    selected?.location && Number.isFinite(selected.location.lat) && Number.isFinite(selected.location.lng)
      ? `https://www.google.com/maps?q=${selected.location.lat},${selected.location.lng}`
      : null;

  return (
    <div className="panel">
      <div className="flex between" style={{ gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Trung tâm Drone</h2>
          <div className="text-muted">Điều phối realtime: tuyến bay, GPS, trạng thái từng drone</div>
        </div>
        <div className="chip-row" style={{ gap: 8 }}>
          <span className="pill ghost">Tổng: {stats?.totals?.total ?? drones.length}</span>
          <span className="pill flying">Đang bay: {stats?.totals?.flying ?? 0}</span>
          <span className="pill idle">Rảnh: {stats?.totals?.idle ?? 0}</span>
          <span className="pill offline">Offline: {stats?.totals?.offline ?? 0}</span>
        </div>
      </div>

      {actionError && <div className="error-text" style={{ marginBottom: 12 }}>{actionError}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 1fr) minmax(420px, 1.1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div className="panel glass" style={{ boxShadow: 'none' }}>
          <div className="flex between" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Danh sách Drone</h3>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo ID, tên, hub..."
              className="form-control"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                borderRadius: 10,
                padding: '10px 12px',
              }}
            />
          </div>
          <div className="table-wrap">
            <table className="drone-table">
              <thead>
                <tr>
                  <th>Drone</th>
                  <th>Pin</th>
                  <th>Trạng thái</th>
                  <th>Hub</th>
                  <th>Đơn hiện tại</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((drone) => (
                  <tr key={drone.droneId} className={drone.droneId === selected?.droneId ? 'active' : ''}>
                    <td>
                      <div className="fw-semibold">{drone.name}</div>
                      <div className="text-muted mono">{drone.droneId}</div>
                    </td>
                    <td>
                      <span className={`pill ${drone.battery < 30 ? 'low' : 'flying'}`}>
                        🔋 {drone.battery ?? '--'}%
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${statusClass(drone.status)}`}>{drone.status || '—'}</span>
                    </td>
                    <td>{hubLookup[drone.hubId] || drone.hubId || '—'}</td>
                    <td className="mono">{drone.currentOrderId || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex" style={{ gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn ghost" onClick={() => setSelectedId(drone.droneId)}>
                          Theo dõi
                        </button>
                        <button
                          className="btn primary"
                          disabled={activatingId === drone.droneId}
                          onClick={() => wakeDrone(drone)}
                        >
                          {activatingId === drone.droneId ? 'Đang bật...' : 'Set idle + clear đơn'}
                        </button>
                      </div>
                      {drone.offline && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          Offline &gt; 10s
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted">
                      Không tìm thấy drone.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel" style={{ background: '#0f172a', color: '#e2e8f0' }}>
          {selected ? (
            <>
              <div className="flex between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="text-muted mono" style={{ letterSpacing: 0.4 }}>
                    {selected.droneId}
                  </div>
                  <h3 style={{ margin: '4px 0 8px' }}>{selected.name}</h3>
                  <div className="chip-row" style={{ gap: 8 }}>
                    <span className={`pill ${statusClass(selected.status)}`}>{selected.status || '—'}</span>
                    <span className={selected.offline ? 'pill offline' : 'pill-battery'}>
                      🔋 {selected.battery ?? '--'}%
                    </span>
                    <span className="pill ghost">
                      Hub: {hubLookup[selected.hubId] || selected.hubId || '—'}
                    </span>
                    <span className="pill ghost">
                      Order: {selected.currentOrderId ? selected.currentOrderId : '—'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    Lần cập nhật: {formatTime(selected.updatedAt)}
                  </div>
                  {googleMapsLink && (
                    <a
                      href={googleMapsLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mono"
                      style={{ fontSize: 12, color: '#38bdf8' }}
                    >
                      GPS: {selected.location.lat.toFixed(5)}, {selected.location.lng.toFixed(5)}
                    </a>
                  )}
                </div>
              </div>

              <div className="chip-row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                {STAGES.map((stage) => {
                  const idx = STAGES.indexOf(stage);
                  const active = stageIndex >= idx;
                  return (
                    <span
                      key={stage}
                      className={`pill ${active ? 'flying' : 'ghost'}`}
                      title={STAGE_LABELS[stage]}
                    >
                      {stage === currentStage ? '● ' : ''}{STAGE_LABELS[stage]}
                    </span>
                  );
                })}
              </div>

              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="card glass" style={{ padding: 12 }}>
                  <div className="text-muted" style={{ marginBottom: 6 }}>
                    Tạo tuyến bay tự động
                  </div>
                  <div className="flex" style={{ gap: 8 }}>
                    <input
                      className="form-control"
                      placeholder="Order ID"
                      value={orderInput}
                      onChange={(e) => setOrderInput(e.target.value)}
                    />
                    <button className="btn primary" disabled={routeLoading} onClick={handleLoadRoute}>
                      {routeLoading ? 'Đang tính...' : 'Tính tuyến'}
                    </button>
                  </div>
                  {routeMeta && (
                    <div className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>
                      Quãng đường ~{Math.round((routeMeta.distanceMeters || 0) / 10) / 100} km • ETA{' '}
                      {routeMeta.etaSeconds ? Math.round(routeMeta.etaSeconds / 60) : '--'} phút
                    </div>
                  )}
                </div>
                <div className="card glass" style={{ padding: 12 }}>
                  <div className="text-muted" style={{ marginBottom: 6 }}>
                    Lộ trình hiện tại
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
                    {routePoints.length ? (
                      routePoints.map((pt, idx) => (
                        <li key={`${pt.label}-${idx}`} className="flex between" style={{ fontSize: 13 }}>
                          <span>
                            {pt.label} {pt.type === 'drone' ? '(realtime)' : ''}
                          </span>
                          <span className="mono text-muted">
                            {pt.lat?.toFixed?.(4)}, {pt.lng?.toFixed?.(4)}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="text-muted">Chưa có waypoint, hãy tính tuyến tự động.</li>
                    )}
                  </ul>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <DroneMapCanvas
                  drones={[selected]}
                  hubs={hubs}
                  focusDroneId={selected.droneId}
                  height={360}
                  routePoints={routePoints}
                />
              </div>
            </>
          ) : (
            <div className="text-muted">Chọn một drone để xem lộ trình và GPS realtime.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DronesPage;
