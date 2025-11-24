import fetch from "node-fetch";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const geocode = async (query) => {
    const q = typeof query === "string" ? query.trim() : "";
    if (!q) {
        return null;
    }
    try {
        console.log("[GEO] Geocoding:", q);
        await delay(1000);
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "FoodDelivery/1.0"
            }
        });
        const data = await res.json().catch(() => []);
        if (!Array.isArray(data) || data.length === 0) {
            console.warn("[GEO] Failed:", q);
            return null;
        }
        const first = data[0];
        const lat = Number(first.lat);
        const lng = Number(first.lon);
        console.log("[GEO] Result:", lat, lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            console.warn("[GEO] Failed:", q);
            return null;
        }
        return {
            lat,
            lng,
            raw: first
        };
    } catch (error) {
        console.warn("[GEO] Failed:", q);
        return null;
    }
};

export default geocode;
