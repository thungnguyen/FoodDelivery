const toRoomId = (prefix, value) => {
  if (!value) {
    return null;
  }
  try {
    const normalized = typeof value === "string" ? value : value.toString();
    if (!normalized || normalized === "[object Object]") {
      return null;
    }
    return `${prefix}${normalized}`;
  } catch (error) {
    return null;
  }
};

export const buildDeliveryRooms = ({ orderId, customerId, restaurantId, driverId }) => {
  const rooms = new Set(["role:superAdmin"]);
  const orderRoom = toRoomId("order:", orderId);
  if (orderRoom) rooms.add(orderRoom);
  const customerRoom = toRoomId("customer:", customerId);
  if (customerRoom) rooms.add(customerRoom);
  const customerUserRoom = toRoomId("user:", customerId);
  if (customerUserRoom) rooms.add(customerUserRoom);
  const restaurantRoom = toRoomId("restaurant:", restaurantId);
  if (restaurantRoom) rooms.add(restaurantRoom);
  const restaurantUserRoom = toRoomId("user:", restaurantId);
  if (restaurantUserRoom) rooms.add(restaurantUserRoom);
  const driverRoom = toRoomId("driver:", driverId);
  if (driverRoom) rooms.add(driverRoom);
  return Array.from(rooms);
};

export default buildDeliveryRooms;

