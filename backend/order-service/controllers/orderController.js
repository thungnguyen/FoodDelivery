import Order from "../models/orderModel.js";
import emitEvent from "../utils/eventBus.js";
import { publish as publishRabbitEvent } from "../src/rabbitmq.js";
import buildOrderRooms from "../utils/realtimeRooms.js";
import { handleOrderStatusFinancials } from "../services/orderFinanceService.js";

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

// @desc Create new order
// @route POST /api/orders
export const createOrder = async (req, res) => {
    try {
        const {
            customerId,
            customerName,
            customerEmail,
            customerPhone,
            restaurantId,
            restaurantName,
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
                foodId: item.foodId,
                foodName: item.foodName,
                quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
                price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0
            }))
            .filter(item => item.foodId && item.quantity > 0);

        if (!normalizedItems.length) {
            return res.status(400).json({ message: "Order items are invalid." });
        }

        // Calculate totals and shipping fee
        const itemsTotal = normalizedItems.reduce(
            (sum, item) => sum + item.quantity * item.price,
            0
        );
        const normalizedShippingFee = parseAmount(shippingFee, 0);
        const totalPrice = Math.round((itemsTotal + normalizedShippingFee) * 100) / 100;

        const normalizedPaymentStatus = PAYMENT_STATUSES.find(
            (value) => value.toLowerCase() === (paymentStatus || "").toLowerCase()
        ) || "Pending";

        const normalizedStatus = canonicalizeStatus(status) || "Pending Confirmation";

        const normalizedPaymentMethod = (paymentMethod || "cash").toLowerCase() === "card" ? "card" : "cash";

        const order = new Order({
            customerId,  // Manually inputted customerId
            customerName,
            customerEmail,
            customerPhone,
            restaurantId,  // Manually inputted restaurantId
            restaurantName,
            items: normalizedItems,
            itemsTotal,
            shippingFee: normalizedShippingFee,
            totalPrice,
            deliveryAddress,
            paymentMethod: normalizedPaymentMethod,
            paymentStatus: normalizedPaymentStatus,
            status: normalizedStatus
        });

        recalculateOrderTotals(order);
        await order.save();
        const orderEventPayload = {
            orderId: order._id.toString(),
            customerId,
            customerName,
            customerEmail,
            customerPhone,
            restaurantId,
            restaurantName,
            items: normalizedItems,
            itemsTotal: order.itemsTotal,
            shippingFee: order.shippingFee,
            totalPrice: order.totalPrice,
            paymentMethod: normalizedPaymentMethod,
            paymentStatus: normalizedPaymentStatus,
            status: order.status,
            deliveryAddress,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
        };
        await publishRabbitEvent("order.created", orderEventPayload);
        emitEvent({
            event: "order.created",
            payload: {
                orderId: order._id,
                status: order.status,
                restaurantId,
                customerId
            },
            rooms: buildOrderRooms({
                orderId: order._id,
                customerId,
                restaurantId
            })
        });
        const response = toOrderResponse(order);
        res.status(201).json(response);
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

        if (req.user?.role === "restaurant") {
            const restaurantId = req.user.restaurantId || req.user.id;
            if (restaurantId) {
                query.restaurantId = restaurantId;
            }
        } else if (req.user?.role === "customer") {
            const customerId = req.user.customerId || req.user.id;
            if (customerId) {
                query.customerId = customerId;
            }
        } else if (req.user?.role === "driver") {
            query.status = { $in: ["Awaiting Driver", "Out for Delivery", "Delivered", "Failed"] };
        }

        const requestedStatus = canonicalizeStatus(req.query?.status);
        if (requestedStatus) {
            query.status = requestedStatus;
        }

        const orders = await Order.find(query);
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

        res.status(200).json(toOrderResponse(order));
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
    const { status } = req.body;
    const requestedStatus = canonicalizeStatus(status);

    if (!requestedStatus) {
        return res.status(400).json({ message: "Invalid status value" });
    }

    const role = req.user?.role;

    if (!role) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const session = await Order.startSession();
    let raisedError = null;
    let orderResponse = null;
    let eventPayload = null;

    try {
        await session.withTransaction(async () => {
            const order = await Order.findById(req.params.id).session(session);
            if (!order) {
                const notFoundError = new Error("Order not found");
                notFoundError.statusCode = 404;
                throw notFoundError;
            }

            const currentStatus = normalizeOrderStatusInPlace(order);
            const previousStatus = currentStatus;

            if (role !== "admin" && CLOSED_STATUSES.has(currentStatus)) {
                const closedError = new Error("Order is already closed and cannot be updated.");
                closedError.statusCode = 400;
                throw closedError;
            }

            if (role === "restaurant") {
                const restaurantId = req.user?.restaurantId || req.user?.id;
                if (restaurantId && order.restaurantId !== restaurantId) {
                    const ownershipError = new Error("Access denied: Cannot modify other restaurant orders.");
                    ownershipError.statusCode = 403;
                    throw ownershipError;
                }
            }

            const roleTransitions = STATUS_TRANSITIONS[role];

            if (role === "admin") {
                order.status = requestedStatus;
            } else if (roleTransitions) {
                const allowedNext = roleTransitions[currentStatus] || [];
                if (!allowedNext.includes(requestedStatus)) {
                    const transitionError = new Error(
                        `Transition from ${currentStatus} to ${requestedStatus} is not allowed for role ${role}.`
                    );
                    transitionError.statusCode = 400;
                    throw transitionError;
                }
                order.status = requestedStatus;
            } else {
                const roleError = new Error("Role not permitted to update order status.");
                roleError.statusCode = 403;
                throw roleError;
            }

            normalizeOrderStatusInPlace(order);

            const financeSummary = await handleOrderStatusFinancials({
                order,
                previousStatus,
                session
            });

            if (financeSummary) {
                order.financialSummary = {
                    ...(order.financialSummary || {}),
                    ...financeSummary
                };
            }

            await order.save({ session });

            orderResponse = toOrderResponse(order);
            eventPayload = {
                event: "order.status.changed",
                payload: {
                    orderId: order._id,
                    status: orderResponse.status,
                    updatedBy: req.user?.id,
                    role
                },
                rooms: buildOrderRooms({
                    orderId: order._id,
                    customerId: order.customerId,
                    restaurantId: order.restaurantId
                })
            };
        });
    } catch (error) {
        raisedError = error;
    } finally {
        await session.endSession();
    }

    if (raisedError) {
        const statusCode = raisedError.statusCode || 500;
        if (statusCode >= 500) {
            console.error("Error updating order status:", raisedError);
            return res.status(500).json({ error: "Server Error" });
        }
        return res.status(statusCode).json({ message: raisedError.message });
    }

    if (eventPayload) {
        emitEvent(eventPayload);
    }

    return res.status(200).json(orderResponse);
};

// @desc Get customer feedback for restaurant menu items
// @route GET /api/orders/feedback/restaurant
export const getRestaurantProductReviews = async (req, res) => {
    try {
        const role = req.user?.role;
        const { restaurantId: queryRestaurantId, foodId: queryFoodId } = req.query || {};

        let restaurantId = queryRestaurantId;
        if (!restaurantId && role === "restaurant") {
            restaurantId = req.user?.restaurantId || req.user?.id || restaurantId;
        }

        if (!restaurantId) {
            return res.status(400).json({ message: "Restaurant identifier is required." });
        }

        const normalizedRestaurantId = String(restaurantId).trim();
        if (!normalizedRestaurantId) {
            return res.status(400).json({ message: "Restaurant identifier is required." });
        }
        const normalizedFoodId =
            typeof queryFoodId === "string" && queryFoodId.trim().length ? queryFoodId.trim() : null;

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
                ...(normalizedFoodId ? { foodId: normalizedFoodId } : {}),
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

        const restaurantAverageRating =
            ratedOrderCount > 0 ? Math.round((ratingSum / ratedOrderCount) * 10) / 10 : null;

        let effectiveReviews = reviews;
        if (normalizedFoodId) {
            effectiveReviews = reviews.filter((review) => {
                if (!review?.foodId) {
                    return false;
                }
                return String(review.foodId) === normalizedFoodId;
            });
        }

        const effectiveReviewCount = effectiveReviews.length;
        const matchedRatingSum = effectiveReviews.reduce((sum, review) => {
            const numeric = Number(review?.rating);
            return Number.isFinite(numeric) ? sum + numeric : sum;
        }, 0);
        const effectiveAverageRating =
            effectiveReviewCount > 0
                ? Math.round((matchedRatingSum / effectiveReviewCount) * 10) / 10
                : null;

        const responsePayload = {
            restaurantId: normalizedRestaurantId,
            restaurantName: orders[0]?.restaurantName || null,
            totalOrdersWithFeedback: normalizedFoodId ? effectiveReviewCount : ratedOrderCount,
            totalReviews: effectiveReviewCount,
            averageRating: normalizedFoodId ? effectiveAverageRating : restaurantAverageRating,
            reviews: effectiveReviews.map((review) => ({
                ...review,
                ratedAt: review.ratedAt ? new Date(review.ratedAt).toISOString() : null
            }))
        };

        if (normalizedFoodId) {
            responsePayload.foodId = normalizedFoodId;
            responsePayload.restaurantAverageRating = restaurantAverageRating;
            responsePayload.restaurantTotalReviews = reviews.length;
            responsePayload.restaurantTotalOrdersWithFeedback = ratedOrderCount;
        }

        res.status(200).json(responsePayload);
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
 
