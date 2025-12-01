import fetch from 'node-fetch';

const DEFAULT_PROFILE = 'driving-car';
const ORS_BASE_URL = process.env.ORS_BASE_URL || 'https://api.openrouteservice.org';

const withTimeout = (ms) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
};

export const buildCoordinateList = ({ origin, waypoints = [], destination }) => {
  const coords = [];
  if (origin) coords.push(origin);
  waypoints.forEach((wp) => coords.push([wp[0], wp[1]]));
  if (destination) coords.push(destination);
  return coords;
};

export const getRouteFromORS = async ({ origin, waypoints = [], destination, profile = DEFAULT_PROFILE }) => {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    throw new Error('ORS_API_KEY is missing');
  }

  const coordinates = buildCoordinateList({ origin, waypoints, destination });
  const body = { coordinates };
  const { controller, timeout } = withTimeout(12_000);

  try {
    const res = await fetch(`${ORS_BASE_URL}/v2/directions/${profile}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ORS error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const summary = data?.features?.[0]?.properties?.summary || {};
    const geometry = data?.features?.[0]?.geometry?.coordinates || [];

    return {
      geometry,
      distance: summary.distance,
      duration: summary.duration,
      raw: data,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('ORS request timed out');
    }
    throw err;
  }
};

export default { getRouteFromORS };
