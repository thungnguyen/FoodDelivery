import Order from "../models/orderModel.js";

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

        const allowedPaymentStatuses = ["Pending", "Paid", "Failed"];
        const normalizedPaymentStatus = allowedPaymentStatuses.find(
            (value) => value.toLowerCase() === (paymentStatus || "").toLowerCase()
        ) || "Pending";

        const allowedStatuses = ["Pending", "Confirmed", "Preparing", "Out for Delivery", "Delivered", "Canceled"];
        const normalizedStatus = allowedStatuses.find(
            (value) => value.toLowerCase() === (status || "").toLowerCase()
        ) || "Pending";

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
        res.status(201).json(order);
    } catch (error) {
        console.error("Error creating order:", error);  // Log error for debugging
        res.status(500).json({ error: "Server Error" });
    }
};

// @desc Get all orders
// @route GET /api/orders
export const getOrders = async (req, res) => {
    try {
        const orders = await Order.find();  // No need to populate manually inputted fields
        res.status(200).json(orders);
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

        res.status(200).json(order);
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
            const allowedPaymentStatuses = ["Pending", "Paid", "Failed"];
            const normalizedPaymentStatus = allowedPaymentStatuses.find(
                (value) => value.toLowerCase() === paymentStatus.toLowerCase()
            );
            if (normalizedPaymentStatus) {
                order.paymentStatus = normalizedPaymentStatus;
            }
        }

        if (status) {
            const allowedStatuses = ["Pending", "Confirmed", "Preparing", "Out for Delivery", "Delivered", "Canceled"];
            const normalizedStatus = allowedStatuses.find(
                (value) => value.toLowerCase() === status.toLowerCase()
            );
            if (normalizedStatus) {
                order.status = normalizedStatus;
            }
        }

        if (paymentMethod) {
            order.paymentMethod = paymentMethod.toLowerCase() === "card" ? "card" : "cash";
        }

        await order.save();

        res.status(200).json(order);
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
        const allowedStatuses = ["Pending", "Confirmed", "Preparing", "Out for Delivery", "Delivered", "Canceled"];
        const normalizedStatus = allowedStatuses.find(
            (value) => value.toLowerCase() === (status || "").toLowerCase()
        );

        if (!normalizedStatus) {
            return res.status(400).json({ message: "Invalid status value" });
        }

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { status: normalizedStatus },
            { new: true }
        );

        if (!order) return res.status(404).json({ message: "Order not found" });

        res.status(200).json(order);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

// @desc Delete (Cancel) order
// @route DELETE /api/orders/:id
export const cancelOrder = async (req, res) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, { status: "Canceled" }, { new: true });
        if (!order) return res.status(404).json({ message: "Order not found" });

        res.status(200).json({ message: "Order canceled", order });
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};
 
