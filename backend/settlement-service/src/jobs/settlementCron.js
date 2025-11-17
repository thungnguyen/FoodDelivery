import cron from "node-cron";
import RestaurantWallet from "../models/RestaurantWallet.js";
import { createSettlementFromTransactions } from "../services/cashflowService.js";
import { startOfDayUtc } from "../utils/dates.js";

const CRON_EXPRESSION = process.env.SETTLEMENT_CRON || "0 3 * * *";
const PERIOD_MODE = process.env.SETTLEMENT_PERIOD || "day";

export const runSettlementCron = () => {
  cron.schedule(CRON_EXPRESSION, async () => {
    try {
      const wallets = await RestaurantWallet.find({ "transactions.settled": false });
      for (const wallet of wallets) {
        const unsettled = wallet.transactions.filter((tx) => !tx.settled);
        if (!unsettled.length) {
          continue;
        }
        const grouped = unsettled.reduce((map, tx) => {
          const key = startOfDayUtc(tx.createdAt).toISOString();
          if (!map.has(key)) {
            map.set(key, []);
          }
          map.get(key).push(tx);
          return map;
        }, new Map());

        for (const group of grouped.values()) {
          await createSettlementFromTransactions({
            wallet,
            transactions: group,
            periodMode: PERIOD_MODE
          });
        }
      }
      if (wallets.length) {
        console.log(`[settlement-service] Processed settlements for ${wallets.length} ví`);
      }
    } catch (error) {
      console.error("[settlement-service] Settlement cron failed", error.message);
    }
  });
};
