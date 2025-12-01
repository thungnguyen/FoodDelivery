import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

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

const looksLikeDroneLabel = (value) => {
  if (!value) return false;
  const normalized = value.toString().trim().toLowerCase();
  return (
    normalized.includes('drone') ||
    /^dr[-_ ]?\d+/.test(normalized) || // DR-01
    /^[a-z]{2,}-?\d{2,}$/i.test(normalized) // HCM-10
  );
};

const resolvePointType = (rawType, idx, total) => {
  const normalized = (rawType || '').toString().toLowerCase();
  if (['hub', 'restaurant', 'customer'].includes(normalized)) return normalized;
  if (idx === 0 || (total && idx === total - 1)) return 'hub';
  if (idx === 1) return 'restaurant';
  return 'customer';
};

const resolvePointLabel = (type, point = {}, idx = 0, droneIdSet = new Set()) => {
  const fallback =
    type === 'restaurant'
      ? 'Nhà hàng'
      : type === 'customer'
      ? 'Khách hàng'
      : type === 'hub'
      ? 'Hub'
      : `Điểm ${idx + 1}`;

  const isDroneLike =
    looksLikeDroneLabel(point.label) ||
    looksLikeDroneLabel(point.name) ||
    droneIdSet.has((point.label || '').toString().trim().toLowerCase()) ||
    droneIdSet.has((point.name || '').toString().trim().toLowerCase());

  if (type === 'restaurant') {
    if (!isDroneLike && point.label) return point.label;
    return point.name || point.restaurantName || fallback;
  }
  if (type === 'customer') {
    if (!isDroneLike && point.label) return point.label;
    return point.name || point.customerName || fallback;
  }
  if (type === 'hub') {
    if (!isDroneLike && point.label) return point.label;
    return point.name || point.code || fallback;
  }
  return !isDroneLike && point.label ? point.label : fallback;
};

const FallbackMap = ({ drones, hubs, height, routePoints }) => {
  const droneIdSet = useMemo(
    () =>
      new Set(
        (drones || [])
          .map((d) => d.droneId)
          .filter(Boolean)
          .map((id) => id.toString().trim().toLowerCase())
      ),
    [drones]
  );
  const points = useMemo(() => {
    const d = (drones || []).map((item) => ({ ...item.location, type: 'drone', label: item.droneId }));
    const h = (hubs || []).map((hub) => ({ ...hub.location, type: 'hub', label: hub.name }));
    const r =
      routePoints?.map((p, idx) => ({
        ...p,
        type: resolvePointType(p.type, idx, routePoints.length),
        label: resolvePointLabel(resolvePointType(p.type, idx, routePoints.length), p, idx, droneIdSet),
      })) || [];
    return [...d, ...h, ...r].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }, [drones, droneIdSet, hubs, routePoints]);

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
                : point.type === 'customer'
                ? '#22c55e'
                : '#fb7185',
            boxShadow:
              point.type === 'drone'
                ? '0 0 0 6px rgba(34, 211, 238, 0.2)'
                : '0 0 0 6px rgba(251, 191, 36, 0.2)',
          }}
          title={`${point.label} (${point.lat?.toFixed?.(4)}, ${point.lng?.toFixed?.(4)})`}
        />
      ))}
    </div>
  );
};

const createMarkerEl = (type = 'default', label = '') => {
  const el = document.createElement('div');
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.borderRadius = '999px';
  el.style.padding = '6px 8px';
  el.style.fontSize = '12px';
  el.style.fontWeight = '600';
  el.style.color = '#0b253a';
  el.style.boxShadow = '0 8px 18px rgba(0,0,0,0.15)';

  let bg = '#e0f2fe';
  let text = label || '';
  if (type === 'drone') {
    bg = '#cffafe';
    text = `🚁 ${label || 'Drone'}`;
  } else if (type === 'hub') {
    bg = '#fef3c7';
    text = `🏠 ${label || 'Hub'}`;
  } else if (type === 'restaurant') {
    bg = '#fee2e2';
    text = `🍽️ ${label || 'NH'}`;
  } else if (type === 'customer') {
    bg = '#dcfce7';
    text = `📍 ${label || 'KH'}`;
  }
  el.style.background = bg;
  el.innerText = text;
  return el;
};

const DroneMapCanvas = ({ drones = [], hubs = [], focusDroneId, height = 420, routePoints = [] }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const [mapReady, setMapReady] = useState(false);
  const MAPTILER_KEY = process.env.REACT_APP_MAPTILER_API_KEY || process.env.MAPTILER_API_KEY;

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
    if (!containerRef.current || !MAPTILER_KEY || mapRef.current) return;
    const center = points.length ? [points[0].lng, points[0].lat] : [106.7, 10.776];
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
      center,
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current.on('load', () => setMapReady(true));
  }, [MAPTILER_KEY, points]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    const map = mapRef.current;
    const markers = markersRef.current;
    const usedKeys = new Set();
    const droneIdSet = new Set(
      (drones || [])
        .map((d) => d.droneId)
        .filter(Boolean)
        .map((id) => id.toString().trim().toLowerCase())
    );

    const ensureBounds = () => {
      if (!points.length) return;
      const bounds = new maplibregl.LngLatBounds();
      points.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
    };

    const upsertMarker = (key, coords, color, title, type, label) => {
      if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return;
      if (markers[key]) {
        markers[key].setLngLat(coords);
      } else {
        const el = createMarkerEl(type, label);
        markers[key] = new maplibregl.Marker({ element: el, color }).setLngLat(coords).addTo(map);
      }
      if (title) {
        markers[key].setPopup(new maplibregl.Popup({ offset: 12 }).setText(title));
      }
      usedKeys.add(key);
    };

    drones.forEach((drone) => {
      const coords = [drone.location?.lng, drone.location?.lat];
      upsertMarker(`drone-${drone.droneId}`, coords, '#22d3ee', `${drone.droneId} • ${drone.status || 'idle'} • 🔋 ${drone.battery ?? '--'}%`, 'drone', drone.droneId);
    });

    hubs.forEach((hub) => {
      const coords = [hub.location?.lng, hub.location?.lat];
      upsertMarker(`hub-${hub.id}`, coords, '#fbbf24', `${hub.name || 'Hub'}`, 'hub', hub.code || hub.name || 'Hub');
    });

    const routeSegments = [];
    if (routePoints.length >= 3) {
      const hub = routePoints[0];
      const restaurant = routePoints[1];
      const customer = routePoints[2];
      const hubBack = routePoints[3] || hub;
      if (hub && restaurant) routeSegments.push({ id: 'route-seg-hr', from: hub, to: restaurant, dashed: false, color: '#0ea5e9' });
      if (restaurant && customer) routeSegments.push({ id: 'route-seg-rc', from: restaurant, to: customer, dashed: true, color: '#f59e0b' });
      if (customer && hubBack) routeSegments.push({ id: 'route-seg-ch', from: customer, to: hubBack, dashed: false, color: '#22c55e' });
    }

    routeSegments.forEach((seg) => {
      const coords = [
        [seg.from.lng, seg.from.lat],
        [seg.to.lng, seg.to.lat],
      ];
      const sourceId = `${seg.id}-src`;
      const layerId = `${seg.id}-layer`;
      const geojson = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
      };
      if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(geojson);
      } else {
        map.addSource(sourceId, { type: 'geojson', data: geojson });
      }

      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': seg.color,
            'line-width': 3,
            'line-opacity': 0.8,
            'line-dasharray': seg.dashed ? [3, 3] : [1, 0],
          },
        });
      } else {
        map.setPaintProperty(layerId, 'line-color', seg.color);
        map.setPaintProperty(layerId, 'line-width', 3);
        map.setPaintProperty(layerId, 'line-opacity', 0.8);
        map.setPaintProperty(layerId, 'line-dasharray', seg.dashed ? [3, 3] : [1, 0]);
      }
      usedKeys.add(sourceId);
      usedKeys.add(layerId);
    });

    routePoints.forEach((pt, idx) => {
      const type = resolvePointType(pt.type, idx, routePoints.length);
      const label = resolvePointLabel(type, pt, idx, droneIdSet);
      const title = pt.title || pt.note || label;
      upsertMarker(
        `route-${idx}`,
        [pt.lng, pt.lat],
        type === 'customer' ? '#22c55e' : type === 'restaurant' ? '#fb7185' : '#fbbf24',
        title,
        type,
        label
      );
    });

    // cleanup old route layers/sources not used
    if (!routeSegments.length && map.getStyle()?.layers) {
      map.getStyle().layers
        .filter((layer) => layer.id.startsWith('route-seg-'))
        .forEach((layer) => {
          if (map.getLayer(layer.id)) map.removeLayer(layer.id);
          if (map.getSource(layer.source)) map.removeSource(layer.source);
        });
    } else if (map.getStyle()?.layers) {
      map.getStyle().layers
        .filter((layer) => layer.id.startsWith('route-seg-'))
        .forEach((layer) => {
          const source = layer.source;
          if (!usedKeys.has(layer.id)) {
            if (map.getLayer(layer.id)) map.removeLayer(layer.id);
            if (source && map.getSource(source)) map.removeSource(source);
          }
        });
    }

    if (focusDroneId) {
      const target = drones.find((drone) => drone.droneId === focusDroneId);
      if (target?.location?.lat && target?.location?.lng) {
        map.flyTo({ center: [target.location.lng, target.location.lat], zoom: 14 });
      }
    } else {
      ensureBounds();
    }

    Object.keys(markers).forEach((key) => {
      if (!usedKeys.has(key)) {
        markers[key].remove();
        delete markers[key];
      }
    });
  }, [drones, hubs, mapReady, points, routePoints, focusDroneId]);

  useEffect(
    () => () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    },
    []
  );

  if (!MAPTILER_KEY) {
    return <FallbackMap drones={drones} hubs={hubs} height={height} routePoints={routePoints} />;
  }

  return (
    <div className="map-container" style={{ height }} ref={containerRef}>
      {!mapReady && <FallbackMap drones={drones} hubs={hubs} height={height} routePoints={routePoints} />}
    </div>
  );
};

export default DroneMapCanvas;
