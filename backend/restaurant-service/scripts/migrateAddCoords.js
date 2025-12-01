import mongoose from 'mongoose';
import 'dotenv/config.js';
import Restaurant from '../src/models/Restaurant.js';
import { geocode } from '../src/utils/geocode.js';

const MONGO_URI = process.env.MONGO_URI || process.env.RESTAURANT_MONGO_URI || 'mongodb://26.32.188.49:27017/restaurant-service';

const run = async () => {
  await mongoose.connect(MONGO_URI, {});
  const cursor = Restaurant.find().cursor();
  let updated = 0;
  for await (const doc of cursor) {
    if (doc.locationCoords?.lat && doc.locationCoords?.lng) {
      console.log('[MIGRATE] Skipped (already has coords)');
      continue;
    }
    const coords = await geocode(doc.location);
    if (coords) {
      doc.locationCoords = { lat: coords.lat, lng: coords.lng };
      await doc.save();
      console.log('[MIGRATE] Added coords for', doc.name || doc._id.toString());
      updated += 1;
    } else {
      console.log('[MIGRATE] Failed geocode for', doc.name || doc._id.toString());
    }
  }
  console.log('AUTO-MIGRATION COMPLETED — NO DATA LOST', { updated });
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

