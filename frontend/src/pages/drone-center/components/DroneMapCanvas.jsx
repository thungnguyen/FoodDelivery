import React, { useEffect, useMemo, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const buildBounds = (points) => {
  if (!points.length) return null;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  points.forEach((p) => {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  });
  return { minLat, maxLat, minLng, maxLng };
};

const useLeafletReady = () => {
  const [ready, setReady] = useState(Boolean(typeof window !== 'undefined' && window.L));
  useEffect(() => {
    if (ready) return undefined;
    const timer = setInterval(() => {
      if (typeof window !== 'undefined' && window.L) {
        setReady(true);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [ready]);
  return ready;
};

const FallbackMap = ({ drones, hubs, height, routePoints }) => {
  const points = useMemo(() => {
    const d = (drones || []).map((item) => ({ ...item.location, type: 'drone', label: item.droneId }));
    const h = (hubs || []).map((hub) => ({ ...hub.location, type: 'hub', label: hub.name }));
    const r =
      routePoints?.map((p, idx) => ({
        ...p,
        type: p.type || (idx === 0 ? 'hub' : idx === routePoints.length - 1 ? 'hub' : idx === 1 ? 'restaurant' : 'customer'),
        label: p.label || p.type || `pt-${idx}`,
      })) || [];
    return [...d, ...h, ...r].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }, [drones, hubs, routePoints]);

  const bounds = useMemo(() => buildBounds(points), [points]);
  const project = (point) => {
    if (!bounds) return { left: '50%', top: '50%' };
    const latRange = bounds.maxLat - bounds.minLat || 1;
    const lngRange = bounds.maxLng - bounds.minLng || 1;
    const x = clamp(((point.lng - bounds.minLng) / lngRange) * 100, 0, 100);
    const y = clamp(100 - ((point.lat - bounds.minLat) / latRange) * 100, 0, 100);
    return { left: `${x}%`, top: `${y}%` };
  };

  return (
    <div className="map-shell" style={{ height }}>
      <div className="map-overlay" />
      {points.map((point) => (
        <div
          key={`${point.type}-${point.label}`}
          style={{
            position: 'absolute',
            width: 14,
            height: 14,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            ...project(point),
            background:
              point.type === 'drone'
                ? '#22d3ee'
                : point.type === 'hub'
                ? '#fbbf24'
                : '#4ade80',
            boxShadow:
              point.type === 'drone'
                ? '0 0 0 6px rgba(34, 211, 238, 0.2)'
                : '0 0 0 6px rgba(251, 191, 36, 0.2)',
          }}
          title={`${point.label} (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`}
        />
      ))}
    </div>
  );
};

const DroneMapCanvas = ({ drones = [], hubs = [], focusDroneId, height = 420, routePoints = [] }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const leafletReady = useLeafletReady();
  const points = useMemo(() => {
    const data = [];
    drones.forEach((drone) => {
      if (drone.location && Number.isFinite(drone.location.lat) && Number.isFinite(drone.location.lng)) {
        data.push({ lat: drone.location.lat, lng: drone.location.lng });
      }
    });
    hubs.forEach((hub) => {
      if (hub.location && Number.isFinite(hub.location.lat) && Number.isFinite(hub.location.lng)) {
        data.push({ lat: hub.location.lat, lng: hub.location.lng });
      }
    });
    routePoints.forEach((pt) => {
      if (Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) {
        data.push({ lat: pt.lat, lng: pt.lng });
      }
    });
    return data;
  }, [drones, hubs, routePoints]);

  useEffect(() => {
    if (!leafletReady || !containerRef.current) {
      return undefined;
    }
    const L = window.L;
    if (!L) return undefined;

    if (!mapRef.current) {
      const center = points.length ? [points[0].lat, points[0].lng] : [10.776, 106.7];
      mapRef.current = L.map(containerRef.current, { preferCanvas: true }).setView(center, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;
    const markers = markersRef.current;
    const usedKeys = new Set();

    drones.forEach((drone) => {
      const key = `drone-${drone.droneId}`;
      const coords = [drone.location?.lat || 0, drone.location?.lng || 0];
      const style = {
        radius: 8,
        color: '#22d3ee',
        weight: 2,
        fillColor: '#22d3ee',
        fillOpacity: 0.85,
      };
      if (markers[key]) {
        markers[key].setLatLng(coords).setStyle(style);
      } else {
        markers[key] = window.L.circleMarker(coords, style).addTo(map);
      }
      markers[key].bindTooltip(`${drone.droneId} • ${drone.status || 'idle'}`);
      usedKeys.add(key);
    });

    hubs.forEach((hub) => {
      const key = `hub-${hub.id}`;
      const coords = [hub.location?.lat || 0, hub.location?.lng || 0];
      const style = {
        radius: 9,
        color: '#fbbf24',
        weight: 2,
        fillColor: '#fbbf24',
        fillOpacity: 0.8,
      };
      if (markers[key]) {
        markers[key].setLatLng(coords).setStyle(style);
      } else {
        markers[key] = window.L.circleMarker(coords, style).addTo(map);
      }
      markers[key].bindTooltip(`${hub.name || 'Hub'}`);
      usedKeys.add(key);
    });

    if (routePoints.length > 1) {
      const key = 'route-polyline';
      const coords = routePoints.map((p) => [p.lat, p.lng]);
      if (markers[key]) {
        markers[key].setLatLngs(coords);
      } else {
        markers[key] = window.L.polyline(coords, { color: '#38bdf8', weight: 3, opacity: 0.7 }).addTo(map);
      }
      usedKeys.add(key);
    }

    routePoints.forEach((pt, idx) => {
      if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) return;
      const key = `route-${idx}`;
      const style = {
        radius: 8,
        color: pt.type === 'restaurant' ? '#fb7185' : pt.type === 'customer' ? '#22c55e' : '#fbbf24',
        weight: 2,
        fillColor: pt.type === 'restaurant' ? '#fb7185' : pt.type === 'customer' ? '#22c55e' : '#fbbf24',
        fillOpacity: 0.9,
      };
      const coords = [pt.lat, pt.lng];
      if (markers[key]) {
        markers[key].setLatLng(coords).setStyle(style);
      } else {
        markers[key] = window.L.circleMarker(coords, style).addTo(map);
      }
      markers[key].bindTooltip(pt.label || pt.type || `wp-${idx}`);
      usedKeys.add(key);
    });

    Object.keys(markers).forEach((key) => {
      if (!usedKeys.has(key)) {
        map.removeLayer(markers[key]);
        delete markers[key];
      }
    });

    if (focusDroneId) {
      const target = drones.find((item) => item.droneId === focusDroneId);
      if (target?.location) {
        map.setView([target.location.lat, target.location.lng], 15);
      }
    } else if (points.length >= 1) {
      const bounds = buildBounds(points);
      if (bounds) {
        map.fitBounds(
          [
            [bounds.minLat, bounds.minLng],
            [bounds.maxLat, bounds.maxLng],
          ],
          { padding: [32, 32] }
        );
      }
    }

    return () => undefined;
  }, [drones, hubs, focusDroneId, leafletReady, points]);

  if (!leafletReady) {
    return <FallbackMap drones={drones} hubs={hubs} height={height} routePoints={routePoints} />;
  }

  return (
    <div className="map-shell" style={{ height }}>
      <div ref={containerRef} style={{ height: '100%' }} />
    </div>
  );
};

export default DroneMapCanvas;
