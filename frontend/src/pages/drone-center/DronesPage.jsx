import React, { useMemo, useState } from 'react';
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
  return 'flying';
};

const DronesPage = () => {
  const { drones, hubs } = useDroneCenter();
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');

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

  return (
    <div className="panel">
      <div className="flex between" style={{ marginBottom: 12 }}>
        <h2>Danh sách Drone</h2>
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
              <th>Drone ID</th>
              <th>Name</th>
              <th>Battery</th>
              <th>Status</th>
              <th>Hub</th>
              <th>Current Order</th>
              <th>Last Update</th>
              <th>View Map</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((drone) => (
              <tr key={drone.droneId}>
                <td>{drone.droneId}</td>
                <td>{drone.name}</td>
                <td>
                  <span className={`pill ${drone.battery < 30 ? 'low' : 'flying'}`}>
                    🔋 {drone.battery ?? '--'}%
                  </span>
                </td>
                <td>
                  <span className={`pill ${statusClass(drone.status)}`}>{drone.status || '—'}</span>
                </td>
                <td>{hubLookup[drone.hubId] || drone.hubId || '—'}</td>
                <td>{drone.currentOrderId || '—'}</td>
                <td>{formatTime(drone.updatedAt)}</td>
                <td>
                  <button className="btn ghost" onClick={() => setSelected(drone)}>
                    View Map
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-muted">
                  Không tìm thấy drone.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex between">
              <div>
                <h3>{selected.name}</h3>
                <div className="text-muted">{selected.droneId}</div>
              </div>
              <button className="btn text" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>

            <div className="chip-row" style={{ margin: '8px 0 12px' }}>
              <span className={`pill ${statusClass(selected.status)}`}>{selected.status}</span>
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

            <DroneMapCanvas drones={[selected]} hubs={hubs} focusDroneId={selected.droneId} height={360} />

            <div className="text-muted" style={{ marginTop: 10 }}>
              Lần cập nhật: {formatTime(selected.updatedAt)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DronesPage;

