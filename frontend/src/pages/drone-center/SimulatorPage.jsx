import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import DroneMapCanvas from './components/DroneMapCanvas';
import { useDroneCenter } from './DroneCenterContext';

const DEFAULT_WAYPOINTS = [
  { key: 'hub-start', label: 'Hub xuất phát', lat: 10.776, lng: 106.7 },
  { key: 'restaurant', label: 'Nhà hàng', lat: 10.779, lng: 106.687 },
  { key: 'customer', label: 'Khách hàng', lat: 10.784, lng: 106.703 },
  { key: 'hub-return', label: 'Hub kết thúc', lat: 10.776, lng: 106.7 },
];

const SimulatorPage = () => {
  const { drones, hubs, applyLocationUpdate, apiBase } = useDroneCenter();
  const [selectedDroneId, setSelectedDroneId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [waypoints, setWaypoints] = useState(DEFAULT_WAYPOINTS);
  const [autoRoute, setAutoRoute] = useState([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [segmentProgress, setSegmentProgress] = useState(0);
  const [battery, setBattery] = useState(92);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [log, setLog] = useState([]);
  const [selectedHubId, setSelectedHubId] = useState('');
  const simRef = useRef({ segmentIndex: 0, segmentProgress: 0, battery: 92 });

  const segments = useMemo(() => {
    const segs = [];
    for (let i = 0; i < waypoints.length - 1; i += 1) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      segs.push({ from, to });
    }
    return segs;
  }, [waypoints]);

  useEffect(() => {
    simRef.current = { segmentIndex, segmentProgress, battery };
  }, [segmentIndex, segmentProgress, battery]);

  useEffect(() => {
    if (!running) return undefined;
    const interpolate = (start, end, t) => start + (end - start) * t;

    const id = setInterval(() => {
      const snapshot = simRef.current;
      const segment = segments[snapshot.segmentIndex];
      if (!segment) {
        setRunning(false);
        return;
      }

      const progress = Math.min(snapshot.segmentProgress + 0.22, 1);
      const lat = interpolate(segment.from.lat, segment.to.lat, progress);
      const lng = interpolate(segment.from.lng, segment.to.lng, progress);
      const nextBattery = Math.max(5, snapshot.battery - 0.4);
      const atEnd = progress >= 1;
      const atLast = snapshot.segmentIndex >= segments.length - 1;
      const nextIndex = atEnd && !atLast ? snapshot.segmentIndex + 1 : snapshot.segmentIndex;
      const nextProgress = atEnd && !atLast ? 0 : progress;

      simRef.current = {
        segmentIndex: nextIndex,
        segmentProgress: nextProgress,
        battery: nextBattery,
      };
      setSegmentIndex(nextIndex);
      setSegmentProgress(nextProgress);
      setBattery(nextBattery);
      if (atEnd && atLast) {
        setRunning(false);
      }

      const payload = {
        droneId: selectedDroneId,
        lat,
        lng,
        battery: Number(nextBattery.toFixed(1)),
      };
      applyLocationUpdate(payload);
      axios.post(`${apiBase}/api/drone/update-location`, payload).catch(() => {});
      setLastUpdate(payload);
      setLog((prev) => [payload, ...prev].slice(0, 8));

      if (orderId && atEnd) {
        if (snapshot.segmentIndex === 0) {
          axios
            .post(`${apiBase}/api/drone/arrived-restaurant`, { orderId, droneId: selectedDroneId })
            .catch(() => {});
          axios
            .post(`${apiBase}/api/order/drone-pickup`, { orderId, droneId: selectedDroneId })
            .catch(() => {});
          setLog((prev) => [
            { event: 'drone_arrived_restaurant', orderId, droneId: selectedDroneId },
            ...prev,
          ]);
        }
        if (snapshot.segmentIndex === segments.length - 2) {
          axios
            .post(`${apiBase}/api/drone/arrived-customer`, { orderId, droneId: selectedDroneId })
            .catch(() => {});
          setLog((prev) => [
            { event: 'drone_arrived_customer', orderId, droneId: selectedDroneId },
            ...prev,
          ]);
        }
        if (atLast) {
          axios.post(`${apiBase}/api/drone/return`, { orderId, droneId: selectedDroneId }).catch(() => {});
          setLog((prev) => [{ event: 'drone_return', orderId, droneId: selectedDroneId }, ...prev]);
        }
      }
    }, 500);

    return () => clearInterval(id);
  }, [running, segments, selectedDroneId, applyLocationUpdate, apiBase, orderId]);

  const handleWaypointChange = (index, key, value) => {
    setWaypoints((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: Number(value) };
      return copy;
    });
  };

  const startSimulation = () => {
    if (!selectedDroneId) return;
    if (orderId && autoRoute.length === 0) {
      return;
    }
    setRunning(true);
    setSegmentIndex(0);
    setSegmentProgress(0);
    setBattery(
      drones.find((d) => d.droneId === selectedDroneId)?.battery ??
        Math.round(70 + Math.random() * 20)
    );
    setLastUpdate(null);
    setLog([]);
    if (orderId) {
      axios
        .post(`${apiBase}/api/admin/drone/assign`, { orderId })
        .then(() => {
          setLog((prev) => [
            { droneId: selectedDroneId, event: 'drone_assigned', orderId, battery },
            ...prev,
          ]);
        })
        .catch(() => {});
    }
  };

  const stopSimulation = () => {
    setRunning(false);
  };

  const selectedDrone = drones.find((d) => d.droneId === selectedDroneId);

  return (
    <>
      <div className="panel">
        <div className="flex between">
          <h2>Drone Simulator</h2>
          <div className="chip-row">
            <span className="badge">Gửi GPS mỗi 500ms</span>
            {running && <span className="badge">Đang mô phỏng</span>}
          </div>
          <div className="form-field">
            <label>Order ID (tùy chọn)</label>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Nhập orderId để auto-route"
            />
            <button
              className="btn ghost"
              type="button"
              disabled={!orderId || autoLoading}
              onClick={async () => {
                setAutoLoading(true);
                try {
                  const res = await axios.post(`${apiBase}/api/drone/auto-route`, {
                    orderId,
                    droneId: selectedDroneId,
                    hubId: selectedHubId,
                  });
                  const wp = res.data?.data?.waypoints || [];
                  if (wp.length >= 2) {
                    setWaypoints(
                      wp.map((p, idx) => ({
                        key: `wp-${idx}`,
                        label: p.type || `WP ${idx + 1}`,
                        lat: p.lat,
                        lng: p.lng,
                      }))
                    );
                    setAutoRoute(wp);
                  } else {
                    setAutoRoute([]);
                  }
                } catch (err) {
                  setAutoRoute([]);
                } finally {
                  setAutoLoading(false);
                }
              }}
            >
              {autoLoading ? 'Đang tải route...' : 'Load auto-route'}
            </button>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-field">
            <label>Chọn drone</label>
            <select
              value={selectedDroneId}
              onChange={(e) => setSelectedDroneId(e.target.value)}
              className="form-control"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <option value="">-- Chọn drone --</option>
              {drones.map((drone) => (
                <option key={drone.droneId} value={drone.droneId}>
                  {drone.droneId} — {drone.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Chọn Hub khởi hành</label>
            <select
              value={selectedHubId}
              onChange={(e) => {
                const hubId = e.target.value;
                setSelectedHubId(hubId);
                const hub = hubs.find((h) => h.id === hubId);
                if (!hub) return;
                setWaypoints((prev) => {
                  const copy = [...prev];
                  copy[0] = { ...copy[0], lat: hub.location.lat, lng: hub.location.lng };
                  copy[copy.length - 1] = {
                    ...copy[copy.length - 1],
                    lat: hub.location.lat,
                    lng: hub.location.lng,
                  };
                  return copy;
                });
              }}
              className="form-control"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <option value="">Giữ tọa độ mặc định</option>
              {hubs.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hub.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-grid">
          {waypoints.map((wp, idx) => (
            <div key={wp.key} className="form-field">
              <label>{wp.label}</label>
              <div className="flex" style={{ gap: 8 }}>
                <input
                  type="number"
                  step="0.0001"
                  value={wp.lat}
                  onChange={(e) => handleWaypointChange(idx, 'lat', e.target.value)}
                  placeholder="Lat"
                />
                <input
                  type="number"
                  step="0.0001"
                  value={wp.lng}
                  onChange={(e) => handleWaypointChange(idx, 'lng', e.target.value)}
                  placeholder="Lng"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex" style={{ gap: 10, marginTop: 12 }}>
          <button className="btn primary" disabled={!selectedDroneId || running} onClick={startSimulation}>
            Start Simulation
          </button>
          <button className="btn ghost" disabled={!running} onClick={stopSimulation}>
            Stop
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="simulator-progress">
            <div
              className="bar"
              style={{
                width:
                  segments.length === 0
                    ? '0%'
                    : `${Math.min(
                        100,
                        ((segmentIndex + segmentProgress) / Math.max(1, segments.length)) * 100
                      ).toFixed(1)}%`,
              }}
            />
          </div>
          <div className="text-muted" style={{ marginTop: 6 }}>
            Tiến độ segment {segmentIndex + 1}/{segments.length} — {Math.round(segmentProgress * 100)}%
          </div>
        </div>
      </div>

      <div className="flex" style={{ gap: 16, flexWrap: 'wrap' }}>
        <div className="panel" style={{ flex: '1 1 340px' }}>
          <h3>Đường bay mô phỏng</h3>
          <DroneMapCanvas
            drones={
              selectedDrone && lastUpdate
                ? [
                    {
                      ...selectedDrone,
                      location: { lat: lastUpdate.lat, lng: lastUpdate.lng },
                      battery,
                    },
                  ]
                : selectedDrone
                ? [selectedDrone]
                : []
            }
            hubs={hubs}
            focusDroneId={selectedDrone?.droneId}
            routePoints={autoRoute.length ? autoRoute : waypoints}
            height={360}
          />
        </div>

        <div className="panel" style={{ flex: '1 1 320px' }}>
          <div className="flex between">
            <h3>Nhật ký gửi GPS</h3>
            <span className="badge">{log.length} gói</span>
          </div>
          {log.length === 0 ? (
            <div className="text-muted">Chưa có dữ liệu mô phỏng.</div>
          ) : (
            <ul className="list">
              {log.map((entry, idx) => (
                <li key={`${entry.droneId}-${idx}`} className="list-item">
                  <div className="flex between">
                    <strong>{entry.droneId}</strong>
                    <span className="text-muted">🔋 {entry.battery}%</span>
                  </div>
                  <div className="text-muted">
                    {entry.lat.toFixed(4)}, {entry.lng.toFixed(4)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};

export default SimulatorPage;
