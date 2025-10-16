import Driver from "../models/Driver.js";

export const assignNearestDriver = async (pickupLat, pickupLng) => {
  try {
    const nearestDriver = await Driver.findOne({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [pickupLng, pickupLat], // (lng, lat)
          },
          $maxDistance: 10000, // 10km range
        },
      },
      status: { $in: ["online", "available"] },
      approvalStatus: "approved",
    });

    if (nearestDriver) {
      // Mark driver as busy / on delivery
      nearestDriver.status = "busy";
      await nearestDriver.save();
    }

    return nearestDriver;
  } catch (error) {
    console.error("🚨 Error finding nearest driver:", error);
    return null;
  }
};
