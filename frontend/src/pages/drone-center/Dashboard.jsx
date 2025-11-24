import React, { useMemo } from 'react';
import { useDroneCenter } from './DroneCenterContext';
import DroneMapCanvas from './components/DroneMapCanvas';

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
  const { drones, stats, events, hubs } = useDroneCenter();

  const lowBattery = stats?.lowBatteryList || [];
  const offline = stats?.offlineList || [];

  const criticalDrones = useMemo(
    () => drones.filter((drone) => drone.offline || (drone.battery ?? 100) < 30),
    [drones]
  );

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
        <DroneMapCanvas drones={drones} hubs={hubs} />
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

