import React, { useMemo, useState } from 'react';
import DroneMapCanvas from './components/DroneMapCanvas';
import { useDroneCenter } from './DroneCenterContext';

const MapPage = () => {
  const { drones, hubs, stats, deliveries } = useDroneCenter();
  const [focus, setFocus] = useState('');

  const active = useMemo(
    () => drones.filter((drone) => !drone.offline).sort((a, b) => (a.droneId > b.droneId ? 1 : -1)),
    [drones]
  );

  const routePoints = useMemo(() => {
    const normalizeId = (val) => (val ? val.toString().toUpperCase() : '');
    const pickDelivery = () => {
      if (focus) {
        const match = deliveries.find((d) => {
          const did =
            d.droneId?.droneId ||
            d.droneId?.code ||
            d.droneId?._id ||
            d.droneId?.id ||
            d.droneId ||
            '';
          return normalizeId(did) === normalizeId(focus);
        });
        if (match && Array.isArray(match.route?.waypoints) && match.route.waypoints.length >= 3) return match;
      }
      return deliveries.find((d) => Array.isArray(d.route?.waypoints) && d.route.waypoints.length >= 3);
    };

    const waypoints = pickDelivery()?.route?.waypoints || [];
    return waypoints.map((wp, idx) => ({
      lat: wp.lat,
      lng: wp.lng,
      type:
        wp.type?.toLowerCase() ||
        (idx === 0 || idx === waypoints.length - 1 ? 'hub' : idx === 1 ? 'restaurant' : 'customer'),
      label: wp.label || wp.type,
    }));
  }, [deliveries, focus]);

  return (
    <>
      <div className="panel">
        <div className="flex between">
          <div>
            <h2>Bản đồ drone realtime</h2>
            <div className="text-muted">Lắng nghe sự kiện "drone-location-update"</div>
          </div>
          <select
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="form-control"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#e2e8f0',
              borderRadius: 10,
              padding: '10px 12px',
              minWidth: 200,
            }}
          >
            <option value="">Chọn drone cần highlight</option>
            {drones.map((drone) => (
              <option key={drone.droneId} value={drone.droneId}>
                {drone.droneId} — {drone.name}
              </option>
            ))}
          </select>
        </div>

        <DroneMapCanvas drones={drones} hubs={hubs} focusDroneId={focus || undefined} routePoints={routePoints} />
        <div className="map-legend">
          <div className="legend-item">
            <span className="marker-dot drone" />
            Drone
          </div>
          <div className="legend-item">
            <span className="marker-dot hub" />
            Hub
          </div>
          <div className="legend-item">
            <span className="marker-dot" style={{ background: '#fb7185' }} />
            Nhà hàng
          </div>
          <div className="legend-item">
            <span className="marker-dot" style={{ background: '#22c55e' }} />
            Khách hàng
          </div>
          <div className="legend-item">
            Tổng: {stats?.totals?.total ?? 0} • Online: {stats?.totals?.total - (stats?.totals?.offline || 0)}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="flex between">
          <h3>Drone hoạt động</h3>
          <span className="badge">{active.length} drone online</span>
        </div>
        <div className="table-wrap">
          <table className="drone-table">
            <thead>
              <tr>
                <th>Drone</th>
                <th>Status</th>
                <th>Pin</th>
                <th>Hub</th>
                <th>Vị trí</th>
              </tr>
            </thead>
            <tbody>
              {active.map((drone) => (
                <tr key={drone.droneId}>
                  <td>
                    {drone.name}
                    <div className="text-muted">{drone.droneId}</div>
                  </td>
                  <td>
                    <span className="pill flying">{drone.status || '—'}</span>
                  </td>
                  <td>
                    <span className={`pill ${drone.battery < 30 ? 'low' : 'flying'}`}>
                      🔋 {drone.battery ?? '--'}%
                    </span>
                  </td>
                  <td>{drone.hubId || '—'}</td>
                  <td className="text-muted">
                    {drone.location?.lat?.toFixed ? drone.location.lat.toFixed(4) : drone.location?.lat || '--'},
                    {drone.location?.lng?.toFixed ? ` ${drone.location.lng.toFixed(4)}` : ` ${drone.location?.lng || ''}`}
                  </td>
                </tr>
              ))}
              {active.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Không có drone online.
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

export default MapPage;

