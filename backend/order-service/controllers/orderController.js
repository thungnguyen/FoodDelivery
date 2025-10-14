import Order from "../models/orderModel.js";

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
    return plain;
};

const normalizeOrderStatusInPlace = (orderDoc) => {
    const canonicalStatus = canonicalizeStatus(orderDoc.status);
    if (canonicalStatus && canonicalStatus !== orderDoc.status) {
        orderDoc.status = canonicalStatus;
    }
    return canonicalStatus || orderDoc.status;
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
            status
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

        // Calculate totalPrice based on items (quantity * price)
        const totalPrice = normalizedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

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
            totalPrice,
            deliveryAddress,
            paymentMethod: normalizedPaymentMethod,
            paymentStatus: normalizedPaymentStatus,
            status: normalizedStatus
        });

        await order.save();
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
        const { items, deliveryAddress, paymentStatus, status, paymentMethod } = req.body;

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
            order.totalPrice = normalizedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
        }
        if (deliveryAddress) order.deliveryAddress = deliveryAddress;

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

        res.status(200).json(toOrderResponse(order));
    } catch (error) {
        console.error("Error updating order status:", error);
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

        res.status(200).json({ message: "Order cancelled", order: toOrderResponse(order) });
    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ error: "Server Error" });
    }
};
 
