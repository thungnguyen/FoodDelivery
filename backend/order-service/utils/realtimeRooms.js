const toRoomId = (prefix, rawValue) => {
    if (!rawValue) {
        return null;
    }
    try {
        const normalized = typeof rawValue === "string" ? rawValue : rawValue.toString();
        if (!normalized || normalized === "[object Object]") {
            return null;
        }
        return `${prefix}${normalized}`;
    } catch (error) {
        return null;
    }
};

export const buildOrderRooms = ({ orderId, customerId, restaurantId }) => {
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

export default buildOrderRooms;

