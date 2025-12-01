import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import promotionRoutes from "./routes/promotionRoutes.js";
import { initRabbit } from "./rabbitmq.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "promotion-service" });
});

app.use("/api/promotions", promotionRoutes);

const PORT = process.env.PORT || 5006;
const mongoUri =
  process.env.PROMOTION_MONGO_URI ||
  process.env.ORDER_MONGO_URI ||
  process.env.MONGO_URI ||
  "mongodb://26.32.188.49:27017/promotions";
const dbName = process.env.PROMOTION_DB_NAME || process.env.ORDER_DB_NAME || undefined;

const start = async () => {
  try {
    await mongoose.connect(mongoUri, dbName ? { dbName } : undefined);
    console.log("[promotion-service] Mongo connected");
    await initRabbit();
    app.listen(PORT, "0.0.0.0", () => console.log(`[promotion-service] running on ${PORT}`));
  } catch (error) {
    console.error("[promotion-service] failed to start", error.message);
    process.exit(1);
  }
};

start();
