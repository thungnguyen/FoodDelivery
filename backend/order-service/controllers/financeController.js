import mongoose from "mongoose";
import VirtualWallet from "../models/virtualWalletModel.js";
import LedgerEntry from "../models/ledgerEntryModel.js";
import Order from "../models/orderModel.js";
import {
    FUND_SOURCES,
    LEDGER_TRANSACTION_TYPES,
    WALLET_TYPES
} from "../config/financeConfig.js";

const toNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return numeric;
};

const normaliseRestaurantId = (raw) => {
    if (!raw || typeof raw !== "string") return "";
    return raw.trim();
};

export const getRestaurantWalletSummary = async (req, res) => {
    try {
        const restaurantId = normaliseRestaurantId(req.params.restaurantId);
        if (!restaurantId) {
            return res.status(400).json({ message: "Restaurant ID is required." });
        }

        const walletDoc =
            (await VirtualWallet.findOne({
                walletType: WALLET_TYPES.RESTAURANT_LIABILITY,
                ownerId: restaurantId
            })
                .select("walletType ownerId balance normalBalance currency lastSettlementAt updatedAt createdAt")
                .lean()) || null;

        const balance = walletDoc ? toNumber(walletDoc.balance) : 0;
        const status = balance > 0 ? "positive" : balance < 0 ? "negative" : "even";

        const latestOrder = await Order.findOne({
            restaurantId,
            "financialSummary.restaurantWalletBalance": { $exists: true }
        })
            .sort({ updatedAt: -1 })
            .select("updatedAt")
            .lean();

        return res.status(200).json({
            wallet: {
                restaurantId,
                walletType: WALLET_TYPES.RESTAURANT_LIABILITY,
                balance,
                normalBalance: walletDoc?.normalBalance || "credit",
                currency: walletDoc?.currency || "VND",
                lastSettlementAt: walletDoc?.lastSettlementAt || null,
                updatedAt: walletDoc?.updatedAt || walletDoc?.createdAt || null,
                status
            },
            lastFinancialUpdate: latestOrder?.updatedAt || null
        });
    } catch (error) {
        console.error("Failed to fetch restaurant wallet summary:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

export const listNegativeRestaurantBalances = async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const minDebt = toNumber(req.query.minDebt || 0);

        const query = {
            walletType: WALLET_TYPES.RESTAURANT_LIABILITY,
            balance: { $lt: minDebt ? -Math.abs(minDebt) : 0 }
        };

        const wallets = await VirtualWallet.find(query)
            .sort({ balance: 1 })
            .limit(limit)
            .select("ownerId walletType balance normalBalance currency updatedAt createdAt")
            .lean();

        return res.status(200).json({
            results: wallets.map((wallet) => ({
                restaurantId: wallet.ownerId,
                balance: toNumber(wallet.balance),
                normalBalance: wallet.normalBalance,
                currency: wallet.currency,
                updatedAt: wallet.updatedAt || wallet.createdAt
            }))
        });
    } catch (error) {
        console.error("Failed to list negative restaurant balances:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

export const getLedgerEntries = async (req, res) => {
    try {
        const {
            orderId: rawOrderId,
            transactionType,
            fundSource,
            restaurantId: rawRestaurantId,
            limit: rawLimit
        } = req.query || {};

        const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 200);
        const filter = {};

        if (rawOrderId) {
            if (!mongoose.Types.ObjectId.isValid(rawOrderId)) {
                return res.status(400).json({ message: "Invalid orderId supplied." });
            }
            filter.orderId = new mongoose.Types.ObjectId(rawOrderId);
        }

        if (transactionType) {
            const allowed = Object.values(LEDGER_TRANSACTION_TYPES);
            if (!allowed.includes(transactionType)) {
                return res.status(400).json({ message: "Unsupported transactionType filter." });
            }
            filter.transactionType = transactionType;
        }

        if (fundSource) {
            const canonicalSource = fundSource.toLowerCase();
            if (!Object.values(FUND_SOURCES).includes(canonicalSource)) {
                return res.status(400).json({ message: "Unsupported fundSource filter." });
            }
            filter.fundSource = canonicalSource;
        }

        const restaurantId = normaliseRestaurantId(rawRestaurantId);
        const role = req.user?.role;
        const userRestaurantId = req.user?.restaurantId || req.user?.id;

        let walletScope = null;
        if (role === "restaurant") {
            const enforcedId = restaurantId || userRestaurantId;
            if (!enforcedId) {
                return res.status(400).json({ message: "Restaurant filter required for restaurant users." });
            }
            if (enforcedId !== userRestaurantId) {
                return res.status(403).json({ message: "Access denied for requested ledger scope." });
            }
            walletScope = await VirtualWallet.find({ ownerId: enforcedId })
                .select("_id")
                .lean();
        } else if (restaurantId) {
            walletScope = await VirtualWallet.find({ ownerId: restaurantId })
                .select("_id")
                .lean();
        }

        if (walletScope) {
            const walletIds = walletScope.map((wallet) => wallet._id);
            if (walletIds.length === 0) {
                return res.status(200).json({ entries: [] });
            }
            filter.$or = [
                { debitWallet: { $in: walletIds } },
                { creditWallet: { $in: walletIds } }
            ];
        }

        const entries = await LedgerEntry.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate([
                { path: "debitWallet", select: "walletType ownerId" },
                { path: "creditWallet", select: "walletType ownerId" }
            ])
            .lean();

        const results = entries.map((entry) => ({
            id: entry._id,
            orderId: entry.orderId?.toString() || null,
            fundSource: entry.fundSource,
            entryType: entry.entryType,
            transactionType: entry.transactionType,
            amount: toNumber(entry.amount),
            debitWallet: entry.debitWallet
                ? {
                      walletType: entry.debitWallet.walletType,
                      ownerId: entry.debitWallet.ownerId,
                      id: entry.debitWallet._id
                  }
                : null,
            creditWallet: entry.creditWallet
                ? {
                      walletType: entry.creditWallet.walletType,
                      ownerId: entry.creditWallet.ownerId,
                      id: entry.creditWallet._id
                  }
                : null,
            description: entry.description || "",
            metadata: entry.metadata || {},
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt
        }));

        return res.status(200).json({ entries: results });
    } catch (error) {
        console.error("Failed to fetch ledger entries:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
