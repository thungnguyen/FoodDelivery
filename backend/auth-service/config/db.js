// backend/auth-service/config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.AUTH_MONGO_URI || process.env.MONGO_URI;

    if (!uri) {
      throw new Error("Missing AUTH_MONGO_URI (or fallback MONGO_URI)");
    }

    const options = {};
    if (process.env.AUTH_DB_NAME) {
      options.dbName = process.env.AUTH_DB_NAME;
    }

    await mongoose.connect(uri, options);
    console.log("✅ MongoDB Connected – Auth Service");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
