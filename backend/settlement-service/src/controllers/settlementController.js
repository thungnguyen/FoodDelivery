import Settlement from "../models/Settlement.js";
import RestaurantWallet from "../models/RestaurantWallet.js";
import { clampPositive, roundCurrency } from "../utils/money.js";

export const getAllSettlements = async (req, res) => {
  try {
    const query = {};
    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status;
    }
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const settlements = await Settlement.find(query).sort({ periodStart: -1 }).limit(limit);
    res.json(settlements);
  } catch (error) {
    console.error("[settlement-service] getAllSettlements", error.message);
    res.status(500).json({ message: "Không thể tải danh sách đối soát" });
  }
};

export const getSettlementsByRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    if (!restaurantId) {
      return res.status(400).json({ message: "Thiếu mã nhà hàng" });
    }
    const wallet = await RestaurantWallet.findOne({ restaurantId });
    const settlements = await Settlement.find({ restaurantId })
      .sort({ periodStart: -1 })
      .limit(50);
    res.json({ wallet, settlements });
  } catch (error) {
    console.error("[settlement-service] getSettlementsByRestaurant", error.message);
    res.status(500).json({ message: "Không thể tải dữ liệu đối soát" });
  }
};

export const listWallets = async (req, res) => {
  try {
    const wallets = await RestaurantWallet.find().sort({ pendingAmount: -1 }).limit(200);
    res.json(wallets);
  } catch (error) {
    console.error("[settlement-service] listWallets", error.message);
    res.status(500).json({ message: "Không thể tải ví nhà hàng" });
  }
};

export const payRestaurant = async (req, res) => {
  try {
    const { settlementId } = req.params;
    const settlement = await Settlement.findById(settlementId);
    if (!settlement) {
      return res.status(404).json({ message: "Không tìm thấy đối soát" });
    }
    if (settlement.status === "paid") {
      return res.status(400).json({ message: "Đợt đối soát đã được thanh toán" });
    }
    const wallet = await RestaurantWallet.findOne({ restaurantId: settlement.restaurantId });
    if (!wallet) {
      return res.status(404).json({ message: "Không tìm thấy ví nhà hàng" });
    }

    wallet.pendingAmount = clampPositive((wallet.pendingAmount || 0) - settlement.netTransfer);
    wallet.totalPaid = roundCurrency((wallet.totalPaid || 0) + settlement.netTransfer);
    wallet.transactions.push({
      type: "payout",
      direction: "debit",
      orderId: null,
      grossSales: 0,
      fees: 0,
      netAmount: settlement.netTransfer,
      description: `Thanh toán đối soát ${settlement._id}`,
      settled: true,
      settledAt: new Date()
    });

    settlement.status = "paid";
    settlement.paidAt = new Date();

    await wallet.save();
    await settlement.save();

    res.json({ settlement, wallet });
  } catch (error) {
    console.error("[settlement-service] payRestaurant", error.message);
    res.status(500).json({ message: "Không thể xử lý thanh toán" });
  }
};
