import mongoose from "mongoose";
import "dotenv/config.js";
import Order from "../models/orderModel.js";
import { geocode } from "../utils/geocode.js";

const MONGO_URI = process.env.MONGO_URI || process.env.ORDER_MONGO_URI || "mongodb://26.32.188.49:27017/order-service";

const run = async () => {
    await mongoose.connect(MONGO_URI, {});
    const cursor = Order.find().cursor();
    let updated = 0;
    for await (const doc of cursor) {
        if (doc.deliveryLat && doc.deliveryLng) {
            console.log("[MIGRATE] Skipped (already has coords)");
            continue;
        }
        const coords = await geocode(doc.deliveryAddress);
        if (coords) {
            doc.deliveryLat = coords.lat;
            doc.deliveryLng = coords.lng;
            await doc.save();
            console.log("[MIGRATE] Added coords for", doc._id.toString());
            updated += 1;
        } else {
            console.log("[MIGRATE] Failed geocode for", doc._id.toString());
        }
    }
    console.log("AUTO-MIGRATION COMPLETED — NO DATA LOST", { updated });
    await mongoose.disconnect();
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

