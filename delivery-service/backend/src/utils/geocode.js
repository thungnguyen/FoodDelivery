import fetch from "node-fetch";

const API_KEY =
  process.env.OPENCAGE_API_KEY || "b831a2728a524c00a5c1e031e3862886";

const buildGeocodeUrls = (address) => {
  const encoded = encodeURIComponent(address);
  const base = `https://api.opencagedata.com/geocode/v1/json?q=${encoded}&language=vi&limit=1&key=${API_KEY}`;
  const urls = [];
  const country = (process.env.GEOCODING_COUNTRY_CODE || "vn").trim();
  if (country.length) {
    urls.push(`${base}&countrycode=${country}`);
  }
  urls.push(base);
  return urls;
};

export async function geocodeAddress(address) {
  const trimmed = (address || "").trim();
  if (!trimmed.length) {
    throw new Error("Address not found");
  }

  const urls = buildGeocodeUrls(trimmed);
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      const result = data?.results?.[0]?.geometry;
      if (result?.lat && result?.lng) {
        return [result.lng, result.lat];
      }
    } catch (error) {
      // Try next strategy; final throw handled below
    }
  }

  const fallbackLat = Number.parseFloat(process.env.GEOCODING_DEFAULT_LAT ?? "");
  const fallbackLng = Number.parseFloat(process.env.GEOCODING_DEFAULT_LNG ?? "");
  if (!Number.isNaN(fallbackLat) && !Number.isNaN(fallbackLng)) {
    return [fallbackLng, fallbackLat];
  }

  throw new Error("Address not found");
}
