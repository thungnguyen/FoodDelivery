import Order from "../models/orderModel.js";
import emitEvent from "../utils/eventBus.js";

const PAYMENT_STATUSES = ["Pending", "Paid", "Failed"];

const CANONICAL_STATUSES = [
    "Pending Confirmation",
    "Confirmed",
    "Preparing",
    "Awaiting Driver",
    "Out for Delivery",
    "Delivered",
    "Completed",
    "Cancelled",
    "Failed",
    "Refunded"
];

const STATUS_ALIASES = {
    pending: "Pending Confirmation",
    "pending confirmation": "Pending Confirmation",
    confirmed: "Confirmed",
    preparing: "Preparing",
    "awaiting driver": "Awaiting Driver",
    "ready for delivery": "Awaiting Driver",
    "out for delivery": "Out for Delivery",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled",
    canceled: "Cancelled",
    "failed/undeliverable": "Failed",
    failed: "Failed",
    refunded: "Refunded"
};

const CLOSED_STATUSES = new Set(["Completed", "Cancelled", "Failed", "Refunded"]);
const RATEABLE_STATUSES = new Set(["Delivered", "Completed"]);

const STATUS_TRANSITIONS = {
    restaurant: {
        "Pending Confirmation": ["Confirmed", "Cancelled"],
        "Confirmed": ["Preparing", "Cancelled"],
        "Preparing": ["Awaiting Driver", "Cancelled"],
        "Awaiting Driver": ["Cancelled"]
    },
    driver: {
        "Awaiting Driver": ["Out for Delivery", "Failed"],
        "Out for Delivery": ["Delivered", "Failed"],
        "Delivered": []
    }
};

const canonicalizeStatus = (statusInput) => {
    if (!statusInput || typeof statusInput !== "string") {
        return undefined;
    }
    const fromAlias = STATUS_ALIASES[statusInput.toLowerCase()];
    if (fromAlias) {
        return fromAlias;
    }
    const match = CANONICAL_STATUSES.find(
        (value) => value.toLowerCase() === statusInput.toLowerCase()
    );
    return match;
};

const toOrderResponse = (orderDoc) => {
    if (!orderDoc) return orderDoc;
    const plain = orderDoc.toObject ? orderDoc.toObject() : { ...orderDoc };
    const canonicalStatus = canonicalizeStatus(plain.status);
    if (canonicalStatus) {
        plain.status = canonicalStatus;
    }
    const resolvedShipping = typeof plain.shippingFee === "number" && plain.shippingFee >= 0
        ? plain.shippingFee
        : 0;
    let resolvedItemsTotal = typeof plain.itemsTotal === "number" && plain.itemsTotal > 0
        ? plain.itemsTotal
        : 0;
    if (resolvedItemsTotal === 0 && Array.isArray(plain.items)) {
        resolvedItemsTotal = plain.items.reduce(
            (sum, item) =>
                sum +
                (Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 0) *
                    (Number.isFinite(Number(item?.price)) ? Number(item.price) : 0),
            0
        );
    }
    plain.itemsTotal = Math.round(resolvedItemsTotal * 100) / 100;
    plain.shippingFee = Math.round(resolvedShipping * 100) / 100;
    plain.totalPrice = Math.round((plain.itemsTotal + plain.shippingFee) * 100) / 100;
    if (plain.parentOrderId) {
        plain.parentOrderId = plain.parentOrderId.toString();
    }
    if (Array.isArray(plain.childOrderIds)) {
        plain.childOrderIds = plain.childOrderIds.map((value) => value && value.toString()).filter(Boolean);
    }
    if (Array.isArray(plain.childOrderSummaries)) {
        plain.childOrderSummaries = plain.childOrderSummaries.map((summary) => {
            if (!summary) return summary;
            const next = { ...summary };
            if (summary.orderId) {
                next.orderId = summary.orderId.toString();
            }
            return next;
        });
    }
    plain.isParentOrder = Boolean(plain.isParentOrder);
    return plain;
};

const normalizeOrderStatusInPlace = (orderDoc) => {
    const canonicalStatus = canonicalizeStatus(orderDoc.status);
    if (canonicalStatus && canonicalStatus !== orderDoc.status) {
        orderDoc.status = canonicalStatus;
    }
    return canonicalStatus || orderDoc.status;
};

const parseAmount = (value, fallback = 0) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        return fallback;
    }
    return Math.round(num * 100) / 100;
};

const allocateShippingFees = (totalShippingFee, groups) => {
    const normalizedTotal = parseAmount(totalShippingFee, 0);
    if (!groups?.length || normalizedTotal <= 0) {
        return Array.isArray(groups) ? groups.map(() => 0) : [];
    }

    const itemsTotals = groups.map((group) => parseAmount(group.itemsTotal ?? 0, 0));
    const aggregateItemsTotal = itemsTotals.reduce((sum, value) => sum + value, 0);
    const allocations = [];
    let remaining = normalizedTotal;

    groups.forEach((group, index) => {
        let share = 0;
        if (index === groups.length - 1) {
            share = remaining;
        } else if (aggregateItemsTotal > 0) {
            share = parseAmount((normalizedTotal * itemsTotals[index]) / aggregateItemsTotal, 0);
        } else {
            share = parseAmount(normalizedTotal / groups.length, 0);
        }

        if (share > remaining) {
            share = remaining;
        }

        share = parseAmount(share, 0);
        remaining = parseAmount(remaining - share, 0);

        allocations.push(share);
    });

    if (allocations.length === groups.length && remaining !== 0) {
        const lastIndex = allocations.length - 1;
        allocations[lastIndex] = parseAmount(allocations[lastIndex] + remaining, 0);
    }

    return allocations;
};

const syncParentOrderFromChildren = async (parentOrderId) => {
    if (!parentOrderId) {
        return null;
    }

    const parentOrder = await Order.findById(parentOrderId);
    if (!parentOrder || !parentOrder.isParentOrder) {
        return null;
    }

    const childOrders = await Order.find({ parentOrderId: parentOrder._id }).sort({ createdAt: 1 });

    parentOrder.childOrderIds = childOrders.map((child) => child._id);
    parentOrder.childOrderSummaries = childOrders.map((child) => ({
        orderId: child._id,
        restaurantId: child.restaurantId,
        restaurantName: child.restaurantName,
        itemsTotal: parseAmount(child.itemsTotal, 0),
        shippingFee: parseAmount(child.shippingFee, 0),
        totalPrice: parseAmount(child.totalPrice, child.itemsTotal || 0),
        status: canonicalizeStatus(child.status) || child.status
    }));

    const mergedItems = [];
    childOrders.forEach((child) => {
        const childItems = Array.isArray(child.items) ? child.items : [];
        childItems.forEach((item) => {
            mergedItems.push({
                foodId: item.foodId,
                foodName: item.foodName,
                restaurantId: item.restaurantId || child.restaurantId,
                restaurantName: item.restaurantName || child.restaurantName,
                quantity: item.quantity,
                price: item.price
            });
        });
    });

    parentOrder.items = mergedItems;

    const aggregateItemsTotal = childOrders.reduce(
        (sum, child) => sum + (Number.isFinite(Number(child.itemsTotal)) ? Number(child.itemsTotal) : 0),
        0
    );
    const aggregateShipping = childOrders.reduce(
        (sum, child) => sum + (Number.isFinite(Number(child.shippingFee)) ? Number(child.shippingFee) : 0),
        0
    );
    const aggregateTotal = childOrders.reduce(
        (sum, child) => sum + (Number.isFinite(Number(child.totalPrice)) ? Number(child.totalPrice) : 0),
        0
    );

    parentOrder.itemsTotal = Math.round(aggregateItemsTotal * 100) / 100;
    parentOrder.shippingFee = Math.round(aggregateShipping * 100) / 100;
    parentOrder.totalPrice = Math.round(aggregateTotal * 100) / 100;

    const childStatuses = new Set(
        childOrders.map((child) => canonicalizeStatus(child.status) || child.status).filter(Boolean)
    );
    if (childStatuses.size === 1) {
        parentOrder.status = Array.from(childStatuses)[0];
    }

    recalculateOrderTotals(parentOrder);
    await parentOrder.save();
    return parentOrder;
};

const recalculateOrderTotals = (orderDoc) => {
    if (!orderDoc) return;
    const normalizedItems = Array.isArray(orderDoc.items) ? orderDoc.items : [];
    const itemsTotal = normalizedItems.reduce(
        (sum, item) =>
            sum +
            (Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 0) *
                (Number.isFinite(Number(item?.price)) ? Number(item.price) : 0),
        0
    );
    orderDoc.itemsTotal = Math.round(itemsTotal * 100) / 100;
    orderDoc.shippingFee = parseAmount(orderDoc.shippingFee, 0);
    orderDoc.totalPrice = Math.round((orderDoc.itemsTotal + orderDoc.shippingFee) * 100) / 100;
};

const toRoomId = (prefix, rawValue) => {
    if (!rawValue) {
        return null;
    }
    try {
        const value = typeof rawValue === "string" ? rawValue : rawValue.toString();
        if (!value || value === "[object Object]") {
            return null;
        }
        return `${prefix}${value}`;
    } catch (err) {
        return null;
    }
};

const buildOrderRooms = ({ orderId, customerId, restaurantId }) => {
    const rooms = new Set();
    const orderRoom = toRoomId("order:", orderId);
    if (orderRoom) rooms.add(orderRoom);
    rooms.add("role:superAdmin");
    const customerRoom = toRoomId("customer:", customerId);
    if (customerRoom) rooms.add(customerRoom);
    const customerUserRoom = toRoomId("user:", customerId);
    if (customerUserRoom) rooms.add(customerUserRoom);
    const restaurantRoom = toRoomId("restaurant:", restaurantId);
    if (restaurantRoom) rooms.add(restaurantRoom);
    const restaurantUserRoom = toRoomId("user:", restaurantId);
    if (restaurantUserRoom) rooms.add(restaurantUserRoom);
    return Array.from(rooms);
};

// @desc Create new order
// @route POST /api/orders
export const createOrder = async (req, res) => {
    try {
        const {
            customerId,
            customerName,
            customerEmail,
            customerPhone,
            items = [],
            deliveryAddress,
            paymentMethod,
            paymentStatus,
            status,
            shippingFee
        } = req.body;

        if (!items.length) {
            return res.status(400).json({ message: "Order must contain at least one item." });
        }

        const normalizedItems = items
            .map(item => ({
                foodId: item.foodId || item.food || item._id,
                foodName: item.foodName || item.name || "",
                restaurantId: item.restaurantId || item.restaurant,
                restaurantName: item.restaurantName || item.restaurantTitle || item.restaurantName,
                quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
                price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0
            }))
            .map((item) => {
                const fallbackRestaurantId =
                    item.restaurantId ??
                    req.body.restaurantId ??
                    req.body.restaurant ??
                    null;
                return {
                    ...item,
                    restaurantId: fallbackRestaurantId !== null && fallbackRestaurantId !== undefined
                        ? String(fallbackRestaurantId)
                        : undefined,
                    restaurantName: item.restaurantName || req.body.restaurantName || ""
                };
            })
            .filter(item => item.foodId && item.quantity > 0 && item.price >= 0);

        if (!normalizedItems.length) {
            return res.status(400).json({ message: "Order items are invalid." });
        }

        const missingRestaurantItems = normalizedItems.filter((item) => !item.restaurantId);
        if (missingRestaurantItems.length) {
            return res.status(400).json({
                message: "Each order item must reference a restaurant."
            });
        }

        const restaurantGroupsMap = new Map();
        normalizedItems.forEach((item) => {
            const key = String(item.restaurantId);
            if (!restaurantGroupsMap.has(key)) {
                restaurantGroupsMap.set(key, {
                    restaurantId: key,
                    restaurantName: item.restaurantName || req.body.restaurantName || null,
                    items: []
                });
            }
            const group = restaurantGroupsMap.get(key);
            if (item.restaurantName && !group.restaurantName) {
                group.restaurantName = item.restaurantName;
            }
            group.items.push({
                foodId: item.foodId,
                foodName: item.foodName,
                restaurantId: item.restaurantId,
                restaurantName: item.restaurantName,
                quantity: item.quantity,
                price: item.price
            });
        });

        const restaurantGroups = Array.from(restaurantGroupsMap.values()).map((group) => {
            const itemsTotal = group.items.reduce(
                (sum, groupItem) => sum + groupItem.quantity * groupItem.price,
                0
            );
            return {
                ...group,
                itemsTotal: Math.round(itemsTotal * 100) / 100
            };
        });

        // Calculate totals and shipping fee
        const itemsTotal = Math.round(
            (restaurantGroups.reduce((sum, group) => sum + (group.itemsTotal || 0), 0) ||
                normalizedItems.reduce((sum, item) => sum + item.quantity * item.price, 0)) * 100
        ) / 100;
        const normalizedShippingFee = parseAmount(shippingFee, 0);
        const totalPrice = Math.round((itemsTotal + normalizedShippingFee) * 100) / 100;

        const normalizedPaymentStatus = PAYMENT_STATUSES.find(
            (value) => value.toLowerCase() === (paymentStatus || "").toLowerCase()
        ) || "Pending";

        const normalizedStatus = canonicalizeStatus(status) || "Pending Confirmation";

        const normalizedPaymentMethod = (paymentMethod || "cash").toLowerCase() === "card" ? "card" : "cash";

        if (restaurantGroups.length <= 1) {
            const singleGroup = restaurantGroups[0];
            const resolvedRestaurantId = singleGroup?.restaurantId;
            if (!resolvedRestaurantId) {
                return res.status(400).json({
                    message: "Restaurant identifier is required for the order."
                });
            }

            const order = new Order({
                customerId,
                customerName,
                customerEmail,
                customerPhone,
                restaurantId: resolvedRestaurantId,
                restaurantName: singleGroup?.restaurantName || req.body.restaurantName || "",
                items: singleGroup?.items || normalizedItems,
                itemsTotal,
                shippingFee: normalizedShippingFee,
                totalPrice,
                deliveryAddress,
                paymentMethod: normalizedPaymentMethod,
                paymentStatus: normalizedPaymentStatus,
                status: normalizedStatus,
                isParentOrder: false,
                parentOrderId: null,
                childOrderIds: []
            });

            recalculateOrderTotals(order);
            await order.save();
            emitEvent({
                event: "order.created",
                payload: {
                    orderId: order._id,
                    status: order.status,
                    restaurantId: order.restaurantId,
                    customerId
                },
                rooms: buildOrderRooms({
                    orderId: order._id,
                    customerId,
                    restaurantId: order.restaurantId
                })
            });
            const response = toOrderResponse(order);
            return res.status(201).json(response);
        }

        const parentOrder = new Order({
            customerId,
            customerName,
            customerEmail,
            customerPhone,
            restaurantId: null,
            restaurantName: null,
            items: normalizedItems,
            itemsTotal,
            shippingFee: normalizedShippingFee,
            totalPrice,
            deliveryAddress,
            paymentMethod: normalizedPaymentMethod,
            paymentStatus: normalizedPaymentStatus,
            status: normalizedStatus,
            isParentOrder: true,
            parentOrderId: null,
            childOrderIds: []
        });

        const shippingAllocations = allocateShippingFees(normalizedShippingFee, restaurantGroups);
        const childOrders = [];

        for (let index = 0; index < restaurantGroups.length; index += 1) {
            const group = restaurantGroups[index];
            const groupShipping = shippingAllocations[index] || 0;
            const childOrder = new Order({
                customerId,
                customerName,
                customerEmail,
                customerPhone,
                restaurantId: group.restaurantId,
                restaurantName: group.restaurantName || "",
                items: group.items,
                itemsTotal: group.itemsTotal,
                shippingFee: groupShipping,
                totalPrice: Math.round((group.itemsTotal + groupShipping) * 100) / 100,
                deliveryAddress,
                paymentMethod: normalizedPaymentMethod,
                paymentStatus: normalizedPaymentStatus,
                status: normalizedStatus,
                isParentOrder: false,
                parentOrderId: parentOrder._id
            });
            recalculateOrderTotals(childOrder);
            await childOrder.save();
            childOrders.push(childOrder);
        }

        parentOrder.childOrderIds = childOrders.map((order) => order._id);
        parentOrder.childOrderSummaries = childOrders.map((order) => ({
            orderId: order._id,
            restaurantId: order.restaurantId,
            restaurantName: order.restaurantName,
            itemsTotal: order.itemsTotal,
            shippingFee: order.shippingFee,
            totalPrice: order.totalPrice,
            status: order.status
        }));
        recalculateOrderTotals(parentOrder);
        await parentOrder.save();

        emitEvent({
            event: "order.created",
            payload: {
                orderId: parentOrder._id,
                status: parentOrder.status,
                restaurantId: null,
                customerId
            },
            rooms: buildOrderRooms({
                orderId: parentOrder._id,
                customerId,
                restaurantId: null
            })
        });

        childOrders.forEach((order) => {
            emitEvent({
                event: "order.created",
                payload: {
                    orderId: order._id,
                    status: order.status,
                    restaurantId: order.restaurantId,
                    customerId
                },
                rooms: buildOrderRooms({
                    orderId: order._id,
                    customerId,
                    restaurantId: order.restaurantId
                })
            });
        });

        const parentResponse = toOrderResponse(parentOrder);
        const childResponses = childOrders.map(toOrderResponse);
        parentResponse.childOrders = childResponses;
        res.status(201).json({
            parentOrder: parentResponse,
            childOrders: childResponses
        });
    } catch (error) {
        console.error("Error creating order:", error);  // Log error for debugging
        res.status(500).json({ error: "Server Error" });
    }
};

// @desc Get all orders
// @route GET /api/orders
export const getOrders = async (req, res) => {
    try {
        const query = {};
        let role = req.user?.role || null;
        let shouldGroupForCustomer = false;

        if (role === "restaurant") {
            const restaurantId = req.user.restaurantId || req.user.id;
            if (restaurantId) {
                query.restaurantId = restaurantId;
                query.isParentOrder = { $ne: true };
            }
        } else if (role === "customer") {
            const customerId = req.user.customerId || req.user.id;
            if (customerId) {
                query.customerId = customerId;
            }
            shouldGroupForCustomer = true;
        } else if (role === "driver") {
            query.status = { $in: ["Awaiting Driver", "Out for Delivery", "Delivered", "Failed"] };
            query.isParentOrder = { $ne: true };
        }

        const requestedStatus = canonicalizeStatus(req.query?.status);
        if (requestedStatus) {
            query.status = requestedStatus;
        }

        const orders = await Order.find(query).sort({ createdAt: -1 });

        if (shouldGroupForCustomer) {
            const parentEntries = new Map();
            const standaloneChildren = [];

            orders.forEach((orderDoc) => {
                if (orderDoc.isParentOrder) {
                    parentEntries.set(orderDoc._id.toString(), {
                        parent: orderDoc,
                        children: []
                    });
                }
            });

            orders.forEach((orderDoc) => {
                if (orderDoc.isParentOrder) {
                    return;
                }
                const parentId = orderDoc.parentOrderId ? orderDoc.parentOrderId.toString() : null;
                if (parentId && parentEntries.has(parentId)) {
                    parentEntries.get(parentId).children.push(orderDoc);
                } else {
                    standaloneChildren.push(orderDoc);
                }
            });

            const responsePayload = [];

            parentEntries.forEach(({ parent, children }) => {
                const parentResponse = toOrderResponse(parent);
                parentResponse.childOrders = children
                    .sort((a, b) => {
                        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        return aTime - bTime;
                    })
                    .map(toOrderResponse);
                responsePayload.push(parentResponse);
            });

            standaloneChildren.forEach((orderDoc) => {
                responsePayload.push(toOrderResponse(orderDoc));
            });

            responsePayload.sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
            });

            return res.status(200).json(responsePayload);
        }

        const response = orders.map(toOrderResponse);
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

// @desc Get single order by ID
// @route GET /api/orders/:id
export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: "Order not found" });

        const response = toOrderResponse(order);

        if (order.isParentOrder) {
            const childOrders = await Order.find({ parentOrderId: order._id }).sort({ createdAt: 1 });
            response.childOrders = childOrders.map(toOrderResponse);
        } else if (order.parentOrderId) {
            const parentOrder = await Order.findById(order.parentOrderId);
            if (parentOrder) {
                response.parentOrderSummary = {
                    _id: parentOrder._id.toString(),
                    status: canonicalizeStatus(parentOrder.status) || parentOrder.status,
                    totalPrice: parseAmount(parentOrder.totalPrice, parentOrder.itemsTotal || 0),
                    itemsTotal: parseAmount(parentOrder.itemsTotal, 0),
                    shippingFee: parseAmount(parentOrder.shippingFee, 0),
                    createdAt: parentOrder.createdAt,
                    updatedAt: parentOrder.updatedAt
                };
            }
        }

        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

// @desc Update order details
// @route PATCH /api/orders/:id
export const updateOrderDetails = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        // Update order details
        const { items, deliveryAddress, paymentStatus, status, paymentMethod, shippingFee } = req.body;

        // Update only provided fields
        if (items) {
            const normalizedItems = items
                .map(item => ({
                    foodId: item.foodId,
                    foodName: item.foodName,
                    quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
                    price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0
                }))
                .filter(item => item.foodId && item.quantity > 0);

            if (!normalizedItems.length) {
                return res.status(400).json({ message: "Updated items are invalid." });
            }

            order.items = normalizedItems;
            order.itemsTotal = normalizedItems.reduce(
                (sum, item) => sum + item.quantity * item.price,
                0
            );
        }
        if (deliveryAddress) order.deliveryAddress = deliveryAddress;

        if (shippingFee !== undefined) {
            order.shippingFee = parseAmount(shippingFee, order.shippingFee || 0);
        }

        if (paymentStatus) {
            const normalizedPaymentStatus = PAYMENT_STATUSES.find(
                (value) => value.toLowerCase() === paymentStatus.toLowerCase()
            );
            if (normalizedPaymentStatus) {
                order.paymentStatus = normalizedPaymentStatus;
            }
        }

        if (status) {
            if (req.user?.role !== "admin") {
                return res.status(403).json({ message: "Only administrators can change status via this endpoint." });
            }
            const normalizedStatus = canonicalizeStatus(status);
            if (!normalizedStatus) {
                return res.status(400).json({ message: "Invalid status value" });
            }
            order.status = normalizedStatus;
        }

        if (paymentMethod) {
            order.paymentMethod = paymentMethod.toLowerCase() === "card" ? "card" : "cash";
        }

        normalizeOrderStatusInPlace(order);
        recalculateOrderTotals(order);
        await order.save();

        res.status(200).json(toOrderResponse(order));
    } catch (error) {
        console.error("Error updating order:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// @desc Update order status
// @route PATCH /api/orders/:id
export const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const requestedStatus = canonicalizeStatus(status);

        if (!requestedStatus) {
            return res.status(400).json({ message: "Invalid status value" });
        }

        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        const role = req.user?.role;

        if (!role) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const currentStatus = normalizeOrderStatusInPlace(order);

        // Block updates when order is already closed (except admins handling refunds or overrides)
        if (role !== "admin" && CLOSED_STATUSES.has(currentStatus)) {
            return res.status(400).json({ message: "Order is already closed and cannot be updated." });
        }

        // Validate ownership for restaurant role
        if (role === "restaurant") {
            const restaurantId = req.user?.restaurantId || req.user?.id;
            if (restaurantId && order.restaurantId !== restaurantId) {
                return res.status(403).json({ message: "Access denied: Cannot modify other restaurant orders." });
            }
        }

        const roleTransitions = STATUS_TRANSITIONS[role];

        if (role === "admin") {
            // Admin can move to any canonical status
            order.status = requestedStatus;
        } else if (roleTransitions) {
            const allowedNext = roleTransitions[currentStatus] || [];
            if (!allowedNext.includes(requestedStatus)) {
                return res.status(400).json({ message: `Transition from ${currentStatus} to ${requestedStatus} is not allowed for role ${role}.` });
            }
            order.status = requestedStatus;
        } else {
            return res.status(403).json({ message: "Role not permitted to update order status." });
        }

        await order.save();

        emitEvent({
            event: "order.status.changed",
            payload: {
                orderId: order._id,
                status: order.status,
                updatedBy: req.user?.id,
                role
            },
            rooms: buildOrderRooms({
                orderId: order._id,
                customerId: order.customerId,
                restaurantId: order.restaurantId
            })
        });

        res.status(200).json(toOrderResponse(order));
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// @desc Get customer feedback for restaurant menu items
// @route GET /api/orders/feedback/restaurant
export const getRestaurantProductReviews = async (req, res) => {
    try {
        const role = req.user?.role;
        let { restaurantId } = req.query || {};

        if (role === "restaurant") {
            restaurantId = req.user?.restaurantId || req.user?.id || restaurantId;
        }

        if (!restaurantId) {
            return res.status(400).json({ message: "Restaurant identifier is required." });
        }

        const normalizedRestaurantId = String(restaurantId);
        const orders = await Order.find({
            restaurantId: normalizedRestaurantId,
            "orderFeedback.rating": { $exists: true, $ne: null }
        })
            .sort({ "orderFeedback.ratedAt": -1, createdAt: -1 })
            .lean();

        if (!orders.length) {
            return res.status(200).json({
                restaurantId: normalizedRestaurantId,
                restaurantName: null,
                totalOrdersWithFeedback: 0,
                totalReviews: 0,
                averageRating: null,
                reviews: []
            });
        }

        let ratingSum = 0;
        let ratedOrderCount = 0;
        const reviews = [];

        orders.forEach((order) => {
            const rating = Number(order?.orderFeedback?.rating);
            if (!Number.isFinite(rating)) {
                return;
            }
            ratedOrderCount += 1;
            ratingSum += rating;
            const rawComment = order?.orderFeedback?.comment;
            const comment =
                typeof rawComment === "string" ? rawComment.trim().slice(0, 1000) : "";
            const ratedAt = order?.orderFeedback?.ratedAt || order?.updatedAt || order?.createdAt;
            const baseReview = {
                orderId: order._id,
                customerId: order.customerId || null,
                customerName: order.customerName || order.customerEmail || "Khách hàng",
                rating: Math.round(rating * 10) / 10,
                comment,
                ratedAt
            };

            const items = Array.isArray(order.items) ? order.items : [];
            if (!items.length) {
                reviews.push({
                    ...baseReview,
                    foodId: null,
                    foodName: "Đơn hàng",
                    quantity: 0,
                    itemPrice: 0
                });
                return;
            }

            items.forEach((item) => {
                reviews.push({
                    ...baseReview,
                    foodId: item?.foodId || null,
                    foodName: item?.foodName || item?.name || "Món ăn",
                    quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 0,
                    itemPrice: Number.isFinite(Number(item?.price)) ? Number(item.price) : 0
                });
            });
        });

        const averageRating =
            ratedOrderCount > 0 ? Math.round((ratingSum / ratedOrderCount) * 10) / 10 : null;

        res.status(200).json({
            restaurantId: normalizedRestaurantId,
            restaurantName: orders[0]?.restaurantName || null,
            totalOrdersWithFeedback: ratedOrderCount,
            totalReviews: reviews.length,
            averageRating,
            reviews: reviews.map((review) => ({
                ...review,
                ratedAt: review.ratedAt ? new Date(review.ratedAt).toISOString() : null
            }))
        });
    } catch (error) {
        console.error("Error fetching restaurant feedback:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

const parseRating = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    const clamped = Math.min(5, Math.max(1, numeric));
    return Math.round(clamped * 10) / 10;
};

const sanitizeComment = (value) => {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim().slice(0, 1000);
};

// @desc Submit feedback for an order/driver after completion
// @route POST /api/orders/:id/feedback
export const submitOrderFeedback = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        const role = req.user?.role;
        if (role !== "customer") {
            return res.status(403).json({ message: "Only customers can submit feedback for orders." });
        }

        const customerId = req.user?.customerId || req.user?.id;
        if (order.customerId && customerId && order.customerId !== customerId) {
            return res.status(403).json({ message: "You can only rate your own orders." });
        }

        const currentStatus = normalizeOrderStatusInPlace(order);
        if (!RATEABLE_STATUSES.has(currentStatus)) {
            return res.status(400).json({ message: "Order must be delivered or completed before submitting feedback." });
        }

        const { orderRating, orderComment, driverRating, driverComment } = req.body || {};

        const parsedOrderRating = parseRating(orderRating);
        const parsedDriverRating = parseRating(driverRating);

        if (parsedOrderRating === null && parsedDriverRating === null) {
            return res.status(400).json({ message: "Please provide at least one valid rating between 1 and 5." });
        }

        if (parsedOrderRating !== null) {
            order.orderFeedback = {
                rating: parsedOrderRating,
                comment: sanitizeComment(orderComment),
                ratedAt: new Date()
            };
        }

        if (parsedDriverRating !== null) {
            order.deliveryFeedback = {
                rating: parsedDriverRating,
                comment: sanitizeComment(driverComment),
                ratedAt: new Date()
            };
        }

        await order.save();

        emitEvent({
            event: "order.feedback.updated",
            payload: {
                orderId: order._id,
                orderFeedback: order.orderFeedback,
                deliveryFeedback: order.deliveryFeedback
            },
            rooms: buildOrderRooms({
                orderId: order._id,
                customerId: order.customerId,
                restaurantId: order.restaurantId
            })
        });

        res.status(200).json(toOrderResponse(order));
    } catch (error) {
        console.error("Error submitting order feedback:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// @desc Delete (Cancel) order
// @route DELETE /api/orders/:id
export const cancelOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: "Order not found" });

        const role = req.user?.role;

        if (!role) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const currentStatus = normalizeOrderStatusInPlace(order);

        if (CLOSED_STATUSES.has(currentStatus)) {
            return res.status(400).json({ message: "Order is already closed and cannot be cancelled." });
        }

        let canCancel = false;

        if (role === "customer") {
            const customerId = req.user?.customerId || req.user?.id;
            if (customerId && order.customerId !== customerId) {
                return res.status(403).json({ message: "Access denied: Cannot cancel other customer orders." });
            }
            canCancel = currentStatus === "Pending Confirmation";
        } else if (role === "restaurant") {
            const restaurantId = req.user?.restaurantId || req.user?.id;
            if (restaurantId && order.restaurantId !== restaurantId) {
                return res.status(403).json({ message: "Access denied: Cannot cancel other restaurant orders." });
            }
            canCancel = ["Pending Confirmation", "Confirmed", "Preparing", "Awaiting Driver"].includes(currentStatus);
        } else if (role === "admin") {
            canCancel = true;
        }

        if (!canCancel) {
            return res.status(400).json({ message: "Cancellation is not allowed at the current order status." });
        }

        order.status = "Cancelled";
        await order.save();

        emitEvent({
            event: "order.cancelled",
            payload: {
                orderId: order._id,
                status: order.status,
                cancelledBy: req.user?.id,
                role
            },
            rooms: buildOrderRooms({
                orderId: order._id,
                customerId: order.customerId,
                restaurantId: order.restaurantId
            })
        });

        res.status(200).json({ message: "Order cancelled", order: toOrderResponse(order) });
    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ error: "Server Error" });
    }
};
 
