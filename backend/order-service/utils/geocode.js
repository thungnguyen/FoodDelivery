import fetch from "node-fetch";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const OPENCAGE_KEY = process.env.OPENCAGE_API_KEY;
const USER_AGENT = "FoodDelivery/1.0";

const parseInlineCoords = (input) => {
    if (!input) return null;
    if (typeof input === "object") {
        const lat = Number(input.lat ?? input.latitude);
        const lng = Number(input.lng ?? input.longitude ?? input.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
        }
    }
    if (typeof input === "string") {
        const match = input.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
        if (match) {
            const lat = Number(match[1]);
            const lng = Number(match[2]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return { lat, lng };
            }
        }
    }
    return null;
};

const withinVietnamBounds = (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110;
};

const geocodeWithOpenCage = async (q) => {
    if (!OPENCAGE_KEY) return null;
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(q)}&key=${OPENCAGE_KEY}&limit=1&language=vi&countrycode=vn`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    const data = await res.json().catch(() => null);
    const first = data?.results?.[0];
    const lat = Number(first?.geometry?.lat);
    const lng = Number(first?.geometry?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, raw: first };
};

const geocodeWithNominatim = async (q) => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=vn`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    const data = await res.json().catch(() => []);
    const first = Array.isArray(data) ? data[0] : null;
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, raw: first };
};

export const geocode = async (query) => {
    const inline = parseInlineCoords(query);
    if (inline && withinVietnamBounds(inline.lat, inline.lng)) {
        return { ...inline, raw: { source: "inline" } };
    }

    const q = typeof query === "string" ? query.trim() : "";
    if (!q) {
        return null;
    }

    console.log("[GEO] Geocoding:", q);
    await delay(400);

    // Prefer OpenCage (has key), fallback to Nominatim
    const oc = await geocodeWithOpenCage(q).catch(() => null);
    if (oc) {
        console.log("[GEO] Result (OpenCage):", oc.lat, oc.lng);
        return oc;
    }

    const nomi = await geocodeWithNominatim(q).catch(() => null);
    if (nomi) {
        console.log("[GEO] Result (Nominatim):", nomi.lat, nomi.lng);
        return nomi;
    }

    const fallbackLat = Number(process.env.GEOCODING_DEFAULT_LAT);
    const fallbackLng = Number(process.env.GEOCODING_DEFAULT_LNG);
    if (withinVietnamBounds(fallbackLat, fallbackLng)) {
        console.warn("[GEO] Using fallback coordinates from env for:", q);
        return { lat: fallbackLat, lng: fallbackLng, raw: { source: "fallback" } };
    }

    console.warn("[GEO] Failed:", q);
    return null;
};

export default geocode;
