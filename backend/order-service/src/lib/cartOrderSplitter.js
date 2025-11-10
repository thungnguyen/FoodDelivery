import Order from "../../models/orderModel.js";
import emitEvent from "../../utils/eventBus.js";
import buildOrderRooms from "../../utils/realtimeRooms.js";
import { publish as publishRabbitEvent } from "../rabbitmq.js";

const DEFAULT_STATUS = "Pending";
const DEFAULT_PAYMENT_METHOD = "cash";
const DEFAULT_PAYMENT_STATUS = "Pending";

const roundCurrency = (value = 0) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return 0;
    }
    return Math.round(number * 100) / 100;
};

const parsePositiveAmount = (value, fallback = 0) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
        return fallback;
    }
    return roundCurrency(number);
};

const normalizeCartEntry = (entry = {}) => {
    const restaurantId =
        entry.restaurantId ||
        entry.restaurant ||
        entry.restaurant?.id ||
        entry.restaurant?._id ||
        null;
    const foodId = entry.foodId || entry._id || entry.id;
    const quantity = Number(entry.quantity);
    const price = Number(entry.price);

    if (
        !restaurantId ||
        !foodId ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(price) ||
        price < 0
    ) {
        return null;
    }

    return {
        restaurantId: restaurantId.toString(),
        restaurantName:
            entry.restaurantName ||
            entry.restaurant?.name ||
            entry.restaurantTitle ||
            "",
        item: {
            foodId: foodId.toString(),
            foodName: entry.foodName || entry.name || entry.title || "",
            quantity,
            price: roundCurrency(price)
        }
    };
};

const groupItemsByRestaurant = (cartItems = []) => {
    const groups = new Map();
    for (const rawEntry of cartItems) {
        const normalized = normalizeCartEntry(rawEntry);
        if (!normalized) {
            continue;
        }
        if (!groups.has(normalized.restaurantId)) {
            groups.set(normalized.restaurantId, {
                restaurantId: normalized.restaurantId,
                restaurantName: normalized.restaurantName || "",
                items: []
            });
        }
        const grouped = groups.get(normalized.restaurantId);
        if (!grouped.restaurantName && normalized.restaurantName) {
            grouped.restaurantName = normalized.restaurantName;
        }
        grouped.items.push(normalized.item);
    }
    return Array.from(groups.values()).filter(group => group.items.length);
};

const buildShippingFeeMap = (groups, payload = {}) => {
    const map = {};
    const perRestaurant = payload.perRestaurantShipping || payload.shippingFees;

    if (perRestaurant && typeof perRestaurant === "object" && !Array.isArray(perRestaurant)) {
        for (const [restaurantId, fee] of Object.entries(perRestaurant)) {
            const parsedFee = parsePositiveAmount(fee, 0);
            if (parsedFee >= 0) {
                map[restaurantId] = parsedFee;
            }
        }
        return map;
    }

    const totalShipping = parsePositiveAmount(payload.shippingFee, 0);
    if (!groups.length || totalShipping <= 0) {
        return map;
    }

    const totalCents = Math.round(totalShipping * 100);
    const baseShare = Math.floor(totalCents / groups.length);
    let remainder = totalCents - baseShare * groups.length;

    groups.forEach(group => {
        let cents = baseShare;
        if (remainder > 0) {
            cents += 1;
            remainder -= 1;
        }
        map[group.restaurantId] = cents / 100;
    });

    return map;
};

const extractCartItems = (payload = {}) => {
    if (Array.isArray(payload.cartItems)) {
        return payload.cartItems;
    }
    if (Array.isArray(payload.items)) {
        return payload.items;
    }
    if (Array.isArray(payload.cart?.items)) {
        return payload.cart.items;
    }
    if (Array.isArray(payload.metadata?.items)) {
        return payload.metadata.items;
    }
    return [];
};

const createOrderEventPayload = (orderDoc) => {
    const plain = orderDoc.toObject ? orderDoc.toObject() : orderDoc;
    return {
        orderId: plain._id.toString(),
        customerId: plain.customerId,
        customerName: plain.customerName,
        customerEmail: plain.customerEmail,
        customerPhone: plain.customerPhone,
        restaurantId: plain.restaurantId,
        restaurantName: plain.restaurantName,
        items: plain.items,
        itemsTotal: plain.itemsTotal,
        shippingFee: plain.shippingFee,
        totalPrice: plain.totalPrice,
        paymentMethod: plain.paymentMethod,
        paymentStatus: plain.paymentStatus,
        status: plain.status,
        deliveryAddress: plain.deliveryAddress,
        paymentIntentId: plain.paymentIntentId,
        paymentId: plain.paymentId,
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt
    };
};

export const createOrdersFromCart = async (payload = {}) => {
    const cartItems = extractCartItems(payload);
    if (!cartItems.length) {
        throw new Error("Cart items are required to create orders.");
    }

    const groupedItems = groupItemsByRestaurant(cartItems);
    if (!groupedItems.length) {
        throw new Error("No valid cart items found for order creation.");
    }

    const customerId = payload.userId || payload.customerId || payload.customer?.id;
    if (!customerId) {
        throw new Error("Customer identifier is required to create orders.");
    }

    const deliveryAddress = payload.deliveryAddress || payload.shippingAddress || payload.address;
    if (!deliveryAddress) {
        throw new Error("Delivery address is required to create orders.");
    }

    const paymentIntentId = payload.paymentIntentId || payload.paymentIntent?.id || payload.stripePaymentIntentId;
    const paymentId = payload.paymentId || payload.paymentRecordId || payload.payment?._id;

    if (!payload.skipDeduplication && (paymentIntentId || paymentId)) {
        const dedupeQuery = [];
        if (paymentIntentId) dedupeQuery.push({ paymentIntentId });
        if (paymentId) dedupeQuery.push({ paymentId });

        if (dedupeQuery.length) {
            const existingOrders = await Order.find({ $or: dedupeQuery });
            if (existingOrders.length) {
                return existingOrders;
            }
        }
    }

    const shippingFeeMap = buildShippingFeeMap(groupedItems, payload);
    const normalizedPaymentMethod = (payload.paymentMethod || DEFAULT_PAYMENT_METHOD).toLowerCase();
    const normalizedPaymentStatus =
        payload.paymentStatus ||
        (normalizedPaymentMethod === "card" ? "Paid" : DEFAULT_PAYMENT_STATUS);
    const normalizedStatus = payload.status || DEFAULT_STATUS;
    const fundSource = normalizedPaymentMethod === "card" ? "online" : "cod";

    const session = await Order.startSession();
    const orders = [];

    try {
        await session.withTransaction(async () => {
            for (const group of groupedItems) {
                const itemsTotal = roundCurrency(
                    group.items.reduce((sum, item) => sum + item.quantity * item.price, 0)
                );
                const shippingFee = parsePositiveAmount(shippingFeeMap[group.restaurantId], 0);
                const totalPrice = roundCurrency(itemsTotal + shippingFee);

                const order = new Order({
                    customerId: customerId.toString(),
                    customerName: payload.customerName || payload.customer?.name || "",
                    customerEmail: payload.customerEmail || payload.customer?.email || "",
                    customerPhone: payload.customerPhone || payload.customer?.phone || "",
                    restaurantId: group.restaurantId,
                    restaurantName: group.restaurantName,
                    items: group.items,
                    itemsTotal,
                    shippingFee,
                    totalPrice,
                    deliveryAddress,
                    paymentMethod: normalizedPaymentMethod === "card" ? "card" : "cash",
                    paymentStatus: normalizedPaymentStatus,
                    status: normalizedStatus,
                    paymentIntentId,
                    paymentId,
                    financialSummary: {
                        ...(payload.financialSummary || {}),
                        fundSource
                    }
                });

                await order.save({ session });
                orders.push(order);
            }
        });
    } finally {
        await session.endSession();
    }

    for (const createdOrder of orders) {
        const eventPayload = createOrderEventPayload(createdOrder);
        await publishRabbitEvent("order.created", eventPayload);
        await emitEvent({
            event: "order.created",
            payload: {
                orderId: createdOrder._id,
                status: createdOrder.status,
                restaurantId: createdOrder.restaurantId,
                customerId: createdOrder.customerId
            },
            rooms: buildOrderRooms({
                orderId: createdOrder._id,
                customerId: createdOrder.customerId,
                restaurantId: createdOrder.restaurantId
            })
        });
    }

    return orders;
};

export default createOrdersFromCart;
