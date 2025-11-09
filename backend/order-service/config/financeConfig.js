export const PLATFORM_OWNER_ID = "platform";
export const DRIVER_POOL_OWNER_ID = "driver_pool";

const parsedCommissionRate = Number(process.env.PLATFORM_COMMISSION_RATE);
export const DEFAULT_COMMISSION_RATE = Number.isFinite(parsedCommissionRate)
    ? parsedCommissionRate
    : 0.2; // 20% commission on food items (overridden by env)
export const DEFAULT_MAINTENANCE_FEE = 150000; // VND, configurable per restaurant
export const DEFAULT_MAINTENANCE_INTERVAL_DAYS = 30;
export const DEFAULT_VAT_RATE = 0.1; // 10% VAT

export const WALLET_TYPES = {
    PLATFORM_MAIN: "platform_main",
    RESTAURANT_LIABILITY: "restaurant_liability",
    DRIVER_LIABILITY: "driver_liability",
    PLATFORM_REVENUE: "platform_revenue"
};

export const LEDGER_ENTRY_TYPES = {
    ONLINE_ITEM_CAPTURE: "ORDER_ONLINE_CAPTURE_ITEMS",
    ONLINE_VAT_CAPTURE: "ORDER_ONLINE_CAPTURE_VAT",
    ONLINE_SHIPPING_CAPTURE: "ORDER_ONLINE_CAPTURE_SHIPPING",
    ONLINE_SHIPPING_RESTAURANT_SHARE: "ORDER_ONLINE_SHIPPING_RESTAURANT_SHARE",
    ONLINE_COMMISSION: "ORDER_ONLINE_COMMISSION",
    MAINTENANCE_FEE: "ORDER_MAINTENANCE_FEE",
    COD_COMMISSION: "ORDER_COD_COMMISSION",
    COD_MAINTENANCE: "ORDER_COD_MAINTENANCE",
    RESTAURANT_PAYOUT: "RESTAURANT_PAYOUT",
    COD_SETTLEMENT_INVOICE: "COD_SETTLEMENT_INVOICE"
};

export const LEDGER_TRANSACTION_TYPES = {
    CAPTURE: "Capture",
    VAT: "VAT",
    COMMISSION: "Commission",
    SUBSCRIPTION_FEE: "Subscription_Fee",
    SHIPPING: "Shipping",
    PAYOUT: "Payout",
    REFUND: "Refund",
    ADJUSTMENT: "Adjustment"
};

export const FUND_SOURCES = {
    ONLINE: "online",
    COD: "cod"
};

export const SHIPPING_SHARES = {
    RESTAURANT: 0.1,
    DRIVER: 0.9
};
