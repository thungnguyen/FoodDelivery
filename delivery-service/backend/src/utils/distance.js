const toRad = (value) => (value * Math.PI) / 180;

export const haversineDistanceKm = (pointA, pointB) => {
  if (!pointA?.coordinates || !pointB?.coordinates) return 0;

  const [lon1, lat1] = pointA.coordinates;
  const [lon2, lat2] = pointB.coordinates;

  if (
    typeof lat1 !== "number" ||
    typeof lon1 !== "number" ||
    typeof lat2 !== "number" ||
    typeof lon2 !== "number"
  ) {
    return 0;
  }

  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
};

export const calculateEarnings = ({ distanceKm, createdAt, deliveredAt }) => {
  const baseFare = 15000;
  const distanceFare = Math.max(distanceKm, 1) * 5000;
  let bonus = 0;

  if (createdAt && deliveredAt) {
    const durationMinutes =
      (new Date(deliveredAt).getTime() - new Date(createdAt).getTime()) /
      60000;
    if (!Number.isNaN(durationMinutes) && durationMinutes <= 45) {
      bonus = 7000;
    }
  }

  const total = Math.round(baseFare + distanceFare + bonus);

  return {
    baseFare,
    distanceFare: Math.round(distanceFare),
    bonus,
    totalEarnings: total,
  };
};
