import mongoose from "mongoose";
import VirtualWallet from "../models/virtualWalletModel.js";
import LedgerEntry from "../models/ledgerEntryModel.js";
import RestaurantFinanceProfile from "../models/restaurantFinanceProfileModel.js";
import SettlementInvoice from "../models/settlementInvoiceModel.js";
import {
    DRIVER_POOL_OWNER_ID,
    FUND_SOURCES,
    LEDGER_ENTRY_TYPES,
    LEDGER_TRANSACTION_TYPES,
    PLATFORM_OWNER_ID,
    SHIPPING_SHARES,
    WALLET_TYPES,
    DEFAULT_VAT_RATE
} from "../config/financeConfig.js";

const WALLET_NORMAL_BALANCE = {
    [WALLET_TYPES.PLATFORM_MAIN]: "debit",
    [WALLET_TYPES.RESTAURANT_LIABILITY]: "credit",
    [WALLET_TYPES.DRIVER_LIABILITY]: "credit",
    [WALLET_TYPES.PLATFORM_REVENUE]: "credit"
};

const roundCurrency = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 100) / 100;
};

const splitShippingFee = (shippingFee) => {
    const total = roundCurrency(shippingFee);
    if (!total) {
        return { driverShare: 0, restaurantShare: 0 };
    }
    const restaurantShare = roundCurrency(total * (SHIPPING_SHARES.RESTAURANT || 0));
    let driverShare = roundCurrency(total - restaurantShare);
    if (roundCurrency(driverShare + restaurantShare) !== total) {
        driverShare = roundCurrency(total - restaurantShare);
    }
    return {
        driverShare,
        restaurantShare
    };
};

const resolveVatRate = (profile) => {
    if (profile && typeof profile.vatRate === "number" && profile.vatRate >= 0) {
        return profile.vatRate;
    }
    return DEFAULT_VAT_RATE;
};

const computeVatBreakdown = (grossAmount, vatRateInput) => {
    const gross = roundCurrency(grossAmount);
    const rate = typeof vatRateInput === "number" && vatRateInput >= 0 ? vatRateInput : DEFAULT_VAT_RATE;
    if (!gross || rate === 0) {
        return {
            vatRate: rate,
            itemsNet: gross,
            vatAmount: 0
        };
    }
    const divisor = 1 + rate;
    let itemsNet = roundCurrency(gross / divisor);
    let vatAmount = roundCurrency(gross - itemsNet);
    const reconciliation = roundCurrency(itemsNet + vatAmount);
    if (reconciliation !== gross) {
        itemsNet = roundCurrency(gross - vatAmount);
    }
    return {
        vatRate: rate,
        itemsNet,
        vatAmount
    };
};

const ensureWallet = async ({ walletType, ownerId, session }) => {
    const normalBalance = WALLET_NORMAL_BALANCE[walletType];
    if (!normalBalance) {
        throw new Error(`Unsupported wallet type: ${walletType}`);
    }

    const doc = await VirtualWallet.findOneAndUpdate(
        { walletType, ownerId },
        {
            $setOnInsert: {
                normalBalance,
                currency: "VND"
            }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            session
        }
    );

    return doc;
};

const applyPosting = async ({ wallet, action, amount, session }) => {
    if (!wallet || !wallet._id || !["debit", "credit"].includes(action)) {
        throw new Error("Invalid wallet posting request");
    }
    if (amount <= 0) {
        return wallet;
    }
    const normalBalance = wallet.normalBalance;

    let delta = 0;
    if (action === "debit") {
        delta = normalBalance === "debit" ? amount : -amount;
    } else {
        delta = normalBalance === "credit" ? amount : -amount;
    }

    const updated = await VirtualWallet.findByIdAndUpdate(
        wallet._id,
        { $inc: { balance: roundCurrency(delta) } },
        { new: true, session }
    );
    return updated;
};

const recordLedgerEntry = async ({
    orderId,
    fundSource,
    entryType,
    transactionType = LEDGER_TRANSACTION_TYPES.CAPTURE,
    dedupKey = "primary",
    amount,
    debitWalletType,
    debitOwnerId,
    creditWalletType,
    creditOwnerId,
    description,
    metadata,
    session
}) => {
    const rounded = roundCurrency(amount);
    if (!rounded || rounded <= 0) {
        return { created: false };
    }

    const debitWallet = await ensureWallet({ walletType: debitWalletType, ownerId: debitOwnerId, session });
    const creditWallet = await ensureWallet({ walletType: creditWalletType, ownerId: creditOwnerId, session });

    try {
        const [entry] = await LedgerEntry.create(
            [
                {
                    orderId,
                    fundSource,
                    entryType,
                    transactionType,
                    dedupKey,
                    amount: rounded,
                    debitWallet: debitWallet._id,
                    creditWallet: creditWallet._id,
                    description,
                    metadata
                }
            ],
            { session }
        );

        const updatedDebitWallet = await applyPosting({
            wallet: debitWallet,
            action: "debit",
            amount: rounded,
            session
        });

        const updatedCreditWallet = await applyPosting({
            wallet: creditWallet,
            action: "credit",
            amount: rounded,
            session
        });

        return {
            created: true,
            entry,
            debitWallet: updatedDebitWallet,
            creditWallet: updatedCreditWallet
        };
    } catch (error) {
        if (error?.code === 11000) {
            // Duplicate entry attempt, treat as no-op for idempotency
            return { created: false, duplicate: true };
        }
        throw error;
    }
};

const ensureFinanceProfile = async (restaurantId, session) => {
    const profile = await RestaurantFinanceProfile.findOneAndUpdate(
        { restaurantId },
        {},
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            session
        }
    );
    return profile;
};

const computeCommissionAmount = (itemsTotal, commissionRate) => {
    if (!commissionRate || commissionRate <= 0) return 0;
    return roundCurrency(itemsTotal * commissionRate);
};

const determineFundSource = (order) => {
    const paymentMethod = (order.paymentMethod || "").toLowerCase();
    if (paymentMethod === "card" && order.paymentStatus === "Paid") {
        return FUND_SOURCES.ONLINE;
    }
    return paymentMethod === "card" ? FUND_SOURCES.ONLINE : FUND_SOURCES.COD;
};

const applyMaintenanceIfDue = async ({ order, profile, fundSource, session }) => {
    const maintenanceFee = roundCurrency(profile.maintenanceFee || 0);
    if (!maintenanceFee) {
        return 0;
    }

    const now = new Date(order.updatedAt || Date.now());
    const interval = profile.maintenanceIntervalDays || 30;

    let shouldCharge = false;
    if (!profile.lastMaintenanceChargedAt || !profile.nextMaintenanceChargeAt) {
        shouldCharge = true;
    } else if (now >= profile.nextMaintenanceChargeAt) {
        shouldCharge = true;
    }

    if (!shouldCharge) {
        return 0;
    }

    const dedupKey = `maintenance:${now.toISOString().slice(0, 10)}`;

    const result = await recordLedgerEntry({
        orderId: order._id,
        fundSource,
        entryType: LEDGER_ENTRY_TYPES.MAINTENANCE_FEE,
        transactionType: LEDGER_TRANSACTION_TYPES.SUBSCRIPTION_FEE,
        dedupKey,
        amount: maintenanceFee,
        debitWalletType: WALLET_TYPES.RESTAURANT_LIABILITY,
        debitOwnerId: order.restaurantId,
        creditWalletType: WALLET_TYPES.PLATFORM_REVENUE,
        creditOwnerId: PLATFORM_OWNER_ID,
        description: "Maintenance fee charge",
        metadata: {
            restaurantId: order.restaurantId
        },
        session
    });

    if (result.created) {
        const nextChargeAt = new Date(now);
        nextChargeAt.setDate(nextChargeAt.getDate() + interval);
        profile.lastMaintenanceChargedAt = now;
        profile.nextMaintenanceChargeAt = nextChargeAt;
        await profile.save({ session });
        return maintenanceFee;
    }

    return 0;
};

const ensureCodSettlementInvoice = async ({ restaurantId, balance, orderId, session }) => {
    if (balance >= 0) {
        return null;
    }

    const existing = await SettlementInvoice.findOne({
        restaurantId,
        status: "pending"
    })
        .session(session);

    if (existing) {
        // Attach order reference for traceability
        existing.orderIds = existing.orderIds || [];
        if (!existing.orderIds.find((docId) => docId?.toString() === orderId.toString())) {
            existing.orderIds.push(orderId);
            await existing.save({ session });
        }
        return existing;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    const [invoice] = await SettlementInvoice.create(
        [
            {
                restaurantId,
                amount: roundCurrency(Math.abs(balance)),
                dueDate,
                orderIds: [orderId],
                metadata: {
                    reason: "COD liability exceeds platform balance"
                }
            }
        ],
        { session }
    );

    return invoice;
};

const processOnlineCompletion = async ({ order, profile, session }) => {
    const fundSource = FUND_SOURCES.ONLINE;
    const summary = {
        fundSource,
        grossItems: roundCurrency(order.itemsTotal || 0),
        itemsNet: 0,
        vatRate: 0,
        vatAmount: 0,
        taxLiability: 0,
        shippingFee: roundCurrency(order.shippingFee || 0),
        commissionAmount: 0,
        maintenanceFee: 0,
        driverPayout: 0,
        driverServiceFee: 0,
        restaurantShippingShare: 0,
        netRestaurant: 0,
        restaurantWalletBalance: 0,
        totalHeld: 0,
        settlementDirection: "payable_to_restaurant"
    };

    const vatDetails = computeVatBreakdown(summary.grossItems, resolveVatRate(profile));
    summary.itemsNet = vatDetails.itemsNet;
    summary.vatAmount = vatDetails.vatAmount;
    summary.vatRate = vatDetails.vatRate;
    summary.taxLiability = vatDetails.vatAmount;

    let restaurantWallet = null;

    if (summary.itemsNet > 0) {
        const capture = await recordLedgerEntry({
            orderId: order._id,
            fundSource,
            entryType: LEDGER_ENTRY_TYPES.ONLINE_ITEM_CAPTURE,
            transactionType: LEDGER_TRANSACTION_TYPES.CAPTURE,
            dedupKey: "items",
            amount: summary.itemsNet,
            debitWalletType: WALLET_TYPES.PLATFORM_MAIN,
            debitOwnerId: PLATFORM_OWNER_ID,
            creditWalletType: WALLET_TYPES.RESTAURANT_LIABILITY,
            creditOwnerId: order.restaurantId,
            description: "Online order items captured (net of VAT)",
            metadata: {
                restaurantId: order.restaurantId,
                vatRate: summary.vatRate
            },
            session
        });
        restaurantWallet = capture.creditWallet || restaurantWallet;
    }

    if (summary.vatAmount > 0) {
        const vatCapture = await recordLedgerEntry({
            orderId: order._id,
            fundSource,
            entryType: LEDGER_ENTRY_TYPES.ONLINE_VAT_CAPTURE,
            transactionType: LEDGER_TRANSACTION_TYPES.VAT,
            dedupKey: "items:vat",
            amount: summary.vatAmount,
            debitWalletType: WALLET_TYPES.PLATFORM_MAIN,
            debitOwnerId: PLATFORM_OWNER_ID,
            creditWalletType: WALLET_TYPES.RESTAURANT_LIABILITY,
            creditOwnerId: order.restaurantId,
            description: "VAT liability captured for restaurant",
            metadata: {
                restaurantId: order.restaurantId,
                vatRate: summary.vatRate
            },
            session
        });
        restaurantWallet = vatCapture.creditWallet || restaurantWallet;
    }

    if (summary.shippingFee > 0) {
        const { driverShare, restaurantShare } = splitShippingFee(summary.shippingFee);
        summary.driverPayout = driverShare;
        summary.driverServiceFee = roundCurrency(summary.shippingFee - driverShare);

        if (driverShare > 0) {
            await recordLedgerEntry({
                orderId: order._id,
                fundSource,
                entryType: LEDGER_ENTRY_TYPES.ONLINE_SHIPPING_CAPTURE,
                transactionType: LEDGER_TRANSACTION_TYPES.SHIPPING,
                dedupKey: "shipping:driver",
                amount: driverShare,
                debitWalletType: WALLET_TYPES.PLATFORM_MAIN,
                debitOwnerId: PLATFORM_OWNER_ID,
                creditWalletType: WALLET_TYPES.DRIVER_LIABILITY,
                creditOwnerId: DRIVER_POOL_OWNER_ID,
                description: "Online order shipping fee allocated to driver",
                metadata: {
                    restaurantId: order.restaurantId
                },
                session
            });
        }

        if (restaurantShare > 0) {
            const shippingRestaurant = await recordLedgerEntry({
                orderId: order._id,
                fundSource,
                entryType: LEDGER_ENTRY_TYPES.ONLINE_SHIPPING_RESTAURANT_SHARE,
                transactionType: LEDGER_TRANSACTION_TYPES.SHIPPING,
                dedupKey: "shipping:restaurant",
                amount: restaurantShare,
                debitWalletType: WALLET_TYPES.PLATFORM_MAIN,
                debitOwnerId: PLATFORM_OWNER_ID,
                creditWalletType: WALLET_TYPES.RESTAURANT_LIABILITY,
                creditOwnerId: order.restaurantId,
                description: "Restaurant share from online shipping fee",
                metadata: {
                    restaurantId: order.restaurantId
                },
                session
            });
            summary.restaurantShippingShare = restaurantShare;
            restaurantWallet = shippingRestaurant.creditWallet || restaurantWallet;
        }
    } else {
        summary.driverServiceFee = 0;
    }

    const commissionAmount = computeCommissionAmount(summary.itemsNet, profile.commissionRate);
    if (commissionAmount > 0) {
        const commission = await recordLedgerEntry({
            orderId: order._id,
            fundSource,
            entryType: LEDGER_ENTRY_TYPES.ONLINE_COMMISSION,
            transactionType: LEDGER_TRANSACTION_TYPES.COMMISSION,
            dedupKey: "commission",
            amount: commissionAmount,
            debitWalletType: WALLET_TYPES.RESTAURANT_LIABILITY,
            debitOwnerId: order.restaurantId,
            creditWalletType: WALLET_TYPES.PLATFORM_REVENUE,
            creditOwnerId: PLATFORM_OWNER_ID,
            description: "Platform commission for online order",
            metadata: {
                restaurantId: order.restaurantId,
                commissionRate: profile.commissionRate
            },
            session
        });
        summary.commissionAmount = commissionAmount;
        restaurantWallet = commission.debitWallet || restaurantWallet;
    }

    const maintenanceFee = await applyMaintenanceIfDue({
        order,
        profile,
        fundSource,
        session
    });
    summary.maintenanceFee = maintenanceFee;

    restaurantWallet = await ensureWallet({
        walletType: WALLET_TYPES.RESTAURANT_LIABILITY,
        ownerId: order.restaurantId,
        session
    });

    summary.netRestaurant = roundCurrency(summary.itemsNet - summary.commissionAmount - summary.maintenanceFee);
    summary.restaurantWalletBalance = roundCurrency(restaurantWallet.balance);
    summary.totalHeld = summary.restaurantWalletBalance;
    summary.settlementDirection =
        summary.restaurantWalletBalance > 0
            ? "payable_to_restaurant"
            : summary.restaurantWalletBalance < 0
            ? "collect_from_restaurant"
            : "even";

    return summary;
};

const processCodCompletion = async ({ order, profile, session }) => {
    const fundSource = FUND_SOURCES.COD;
    const summary = {
        fundSource,
        grossItems: roundCurrency(order.itemsTotal || 0),
        itemsNet: 0,
        vatRate: 0,
        vatAmount: 0,
        taxLiability: 0,
        shippingFee: roundCurrency(order.shippingFee || 0),
        commissionAmount: 0,
        maintenanceFee: 0,
        driverPayout: 0,
        driverServiceFee: 0,
        restaurantShippingShare: 0,
        netRestaurant: 0,
        restaurantWalletBalance: 0,
        totalHeld: 0,
        settlementDirection: "collect_from_restaurant"
    };

    const vatDetails = computeVatBreakdown(summary.grossItems, resolveVatRate(profile));
    summary.itemsNet = vatDetails.itemsNet;
    summary.vatAmount = vatDetails.vatAmount;
    summary.vatRate = vatDetails.vatRate;
    summary.taxLiability = vatDetails.vatAmount;

    if (summary.shippingFee > 0) {
        const { driverShare, restaurantShare } = splitShippingFee(summary.shippingFee);
        summary.driverPayout = driverShare;
        summary.driverServiceFee = roundCurrency(summary.shippingFee - driverShare);
        summary.restaurantShippingShare = restaurantShare;
    }

    let restaurantWallet = await ensureWallet({
        walletType: WALLET_TYPES.RESTAURANT_LIABILITY,
        ownerId: order.restaurantId,
        session
    });

    const commissionAmount = computeCommissionAmount(summary.itemsNet, profile.commissionRate);
    if (commissionAmount > 0) {
        const commission = await recordLedgerEntry({
            orderId: order._id,
            fundSource,
            entryType: LEDGER_ENTRY_TYPES.COD_COMMISSION,
            transactionType: LEDGER_TRANSACTION_TYPES.COMMISSION,
            dedupKey: "commission",
            amount: commissionAmount,
            debitWalletType: WALLET_TYPES.RESTAURANT_LIABILITY,
            debitOwnerId: order.restaurantId,
            creditWalletType: WALLET_TYPES.PLATFORM_REVENUE,
            creditOwnerId: PLATFORM_OWNER_ID,
            description: "Platform commission for COD order",
            metadata: {
                restaurantId: order.restaurantId,
                commissionRate: profile.commissionRate
            },
            session
        });
        summary.commissionAmount = commissionAmount;
        restaurantWallet = commission.debitWallet || restaurantWallet;
    }

    const maintenanceFee = await applyMaintenanceIfDue({
        order,
        profile,
        fundSource,
        session
    });
    summary.maintenanceFee = maintenanceFee;

    restaurantWallet = await ensureWallet({
        walletType: WALLET_TYPES.RESTAURANT_LIABILITY,
        ownerId: order.restaurantId,
        session
    });

    summary.netRestaurant = roundCurrency(summary.itemsNet - summary.commissionAmount - summary.maintenanceFee);
    summary.restaurantWalletBalance = roundCurrency(restaurantWallet.balance);
    summary.totalHeld = summary.restaurantWalletBalance;
    summary.settlementDirection =
        summary.restaurantWalletBalance > 0
            ? "payable_to_restaurant"
            : summary.restaurantWalletBalance < 0
            ? "collect_from_restaurant"
            : "even";

    await ensureCodSettlementInvoice({
        restaurantId: order.restaurantId,
        balance: summary.restaurantWalletBalance,
        orderId: order._id,
        session
    });

    return summary;
};

export const handleOrderStatusFinancials = async ({ order, previousStatus, session }) => {
    const normalizedPrevious = previousStatus;
    const normalizedCurrent = order.status;

    if (normalizedPrevious === "Completed" || normalizedCurrent !== "Completed") {
        return null;
    }

    const fundSource = determineFundSource(order);

    if (fundSource === FUND_SOURCES.ONLINE && order.paymentStatus !== "Paid") {
        // Skip until payment is captured
        return null;
    }

    const profile = await ensureFinanceProfile(order.restaurantId, session);

    if (fundSource === FUND_SOURCES.ONLINE) {
        const summary = await processOnlineCompletion({ order, profile, session });
        return {
            ...summary,
            processedAt: new Date()
        };
    }

    const summary = await processCodCompletion({ order, profile, session });
    return {
        ...summary,
        processedAt: new Date()
    };
};

export const createRestaurantPayout = async ({
    restaurantId,
    amount,
    session,
    initiatedBy,
    referenceOrderId
}) => {
    const rounded = roundCurrency(amount);
    if (!rounded || rounded <= 0) {
        throw new Error("Payout amount must be greater than zero");
    }

    const restaurantWallet = await ensureWallet({
        walletType: WALLET_TYPES.RESTAURANT_LIABILITY,
        ownerId: restaurantId,
        session
    });

    if (restaurantWallet.balance <= 0) {
        throw new Error("Restaurant liability wallet does not have positive balance for payout");
    }

    if (rounded > restaurantWallet.balance) {
        throw new Error("Requested payout exceeds available balance");
    }

    if (!referenceOrderId || !mongoose.Types.ObjectId.isValid(referenceOrderId)) {
        throw new Error("A valid reference order ID is required for payout ledger entry");
    }

    const payout = await recordLedgerEntry({
        orderId: referenceOrderId,
        fundSource: FUND_SOURCES.ONLINE,
        entryType: LEDGER_ENTRY_TYPES.RESTAURANT_PAYOUT,
        transactionType: LEDGER_TRANSACTION_TYPES.PAYOUT,
        dedupKey: `payout:${Date.now()}`,
        amount: rounded,
        debitWalletType: WALLET_TYPES.RESTAURANT_LIABILITY,
        debitOwnerId: restaurantId,
        creditWalletType: WALLET_TYPES.PLATFORM_MAIN,
        creditOwnerId: PLATFORM_OWNER_ID,
        description: "Restaurant payout transfer",
        metadata: {
            initiatedBy
        },
        session
    });

    return payout;
};
