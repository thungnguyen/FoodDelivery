import RestaurantWallet from "../models/RestaurantWallet.js";
import Settlement from "../models/Settlement.js";
import { clampPositive, roundCurrency, toNumber } from "../utils/money.js";
import { resolvePeriodRange } from "../utils/dates.js";

const COMMISSION_RATE = Number(process.env.SETTLEMENT_COMMISSION_RATE || 0.2);
const HOLD_DAYS = Number(process.env.PAYOUT_HOLD_DAYS || 7);

const safeCommission = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    return COMMISSION_RATE;
  }
  return numeric;
};

export const ensureWallet = async (restaurantId) => {
  const wallet = await RestaurantWallet.findOneAndUpdate(
    { restaurantId },
    {},
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return wallet;
};

export const handleOrderCompletedEvent = async (payload = {}) => {
  const restaurantId = payload.restaurantId;
  if (!restaurantId) {
    return;
  }

  const itemsTotal = toNumber(payload.itemsTotal, payload.total);
  const shippingFee = toNumber(payload.shippingFee, 0);
  const promotionDiscount = toNumber(payload.promotionDiscount || payload.promotion?.discountAmount, 0);
  const baseGross = clampPositive(itemsTotal - promotionDiscount);
  const grossSales = roundCurrency(baseGross + shippingFee);

  const commission = clampPositive(baseGross * safeCommission(process.env.SETTLEMENT_COMMISSION_RATE));
  const restaurantItemShare = clampPositive(baseGross - commission);
  const netAmount = clampPositive(payload.financialSummary?.netRestaurant ?? restaurantItemShare);
  const fees = clampPositive(grossSales - netAmount); // gồm phí drone và hoa hồng

  const wallet = await ensureWallet(restaurantId);
  wallet.transactions.push({
    type: "order",
    direction: "credit",
    orderId: payload.orderId || null,
    grossSales,
    fees,
    netAmount,
    description: `Đơn ${payload.orderId || "unknown"} hoàn tất`,
    createdAt: new Date()
  });
  wallet.pendingAmount = roundCurrency((wallet.pendingAmount || 0) + netAmount);
  await wallet.save();
};

export const createSettlementFromTransactions = async ({ wallet, transactions, periodMode = "day" }) => {
  if (!wallet || !transactions.length) {
    return null;
  }
  const reference = transactions[0]?.createdAt || new Date();
  const { periodStart, periodEnd } = resolvePeriodRange(reference, periodMode);
  const payoutDueAt = new Date(Date.now() + HOLD_DAYS * 24 * 60 * 60 * 1000);
  const txIds = transactions.map((tx) => tx._id?.toString());

  let settlement = await Settlement.findOne({ restaurantId: wallet.restaurantId, periodStart });
  let gross = 0;
  let fees = 0;
  let net = 0;
  const txSummaries = transactions.map((tx) => {
    gross += tx.grossSales || 0;
    fees += tx.fees || 0;
    net += tx.netAmount || 0;
    return {
      orderId: tx.orderId,
      grossSales: tx.grossSales,
      fees: tx.fees,
      netAmount: tx.netAmount
    };
  });

  gross = roundCurrency(gross);
  fees = roundCurrency(fees);
  net = roundCurrency(net);

  if (!settlement) {
    settlement = await Settlement.create({
      restaurantId: wallet.restaurantId,
      periodStart,
      periodEnd,
      payoutDueAt,
      holdDays: HOLD_DAYS,
      grossSales: gross,
      fees,
      netTransfer: net,
      status: "pending",
      transactions: txSummaries
    });
  } else {
    if (!settlement.payoutDueAt) {
      settlement.payoutDueAt = payoutDueAt;
    }
    if (!settlement.holdDays) {
      settlement.holdDays = HOLD_DAYS;
    }
    settlement.grossSales = roundCurrency((settlement.grossSales || 0) + gross);
    settlement.fees = roundCurrency((settlement.fees || 0) + fees);
    settlement.netTransfer = roundCurrency((settlement.netTransfer || 0) + net);
    settlement.transactions.push(...txSummaries);
    await settlement.save();
  }

  wallet.transactions.forEach((tx) => {
    if (txIds.includes(tx._id?.toString())) {
      tx.settled = true;
      tx.settlementId = settlement._id;
      tx.settledAt = new Date();
    }
  });
  wallet.lastSettlementAt = new Date();
  await wallet.save();
  return settlement;
};
