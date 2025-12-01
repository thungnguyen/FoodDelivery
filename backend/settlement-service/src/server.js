import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import settlementRoutes from "./routes/settlementRoutes.js";
import { initRabbit } from "./rabbitmq.js";
import { startOrderConsumers } from "./events/orderConsumer.js";
import { runSettlementCron } from "./jobs/settlementCron.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "settlement-service" });
});

app.use("/api/settlements", settlementRoutes);

const PORT = process.env.PORT || 5007;
const mongoUri =
  process.env.SETTLEMENT_MONGO_URI ||
  process.env.ORDER_MONGO_URI ||
  process.env.MONGO_URI ||
  "mongodb://26.32.188.49:27017/settlements";
const dbName = process.env.SETTLEMENT_DB_NAME || process.env.ORDER_DB_NAME || undefined;

const start = async () => {
  try {
    await mongoose.connect(mongoUri, dbName ? { dbName } : undefined);
    console.log("[settlement-service] Mongo connected");
    await initRabbit();
    await startOrderConsumers();
    runSettlementCron();
    app.listen(PORT, "0.0.0.0", () => console.log(`[settlement-service] running on ${PORT}`));
  } catch (error) {
    console.error("[settlement-service] failed to start", error.message);
    process.exit(1);
  }
};

start();
