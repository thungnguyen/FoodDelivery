import React, { useEffect, useState } from "react";
import axios from "axios";
import { ORDER_SERVICE_URL } from "../../utils/serviceUrls";
import { Link } from "react-router-dom";
import { Button, Spinner, Badge } from "react-bootstrap";

function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch orders from the backend when the component mounts
  useEffect(() => {
    const fetchOrders = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Please log in to view your orders.");
        setLoading(false);
        return;
      }

      try {
        setError("");
        const response = await axios.get(`${ORDER_SERVICE_URL}/api/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOrders(response.data);
      } catch (err) {
        console.error("Error fetching orders:", err);
        setError(err.response?.data?.message || "Unable to load orders. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  // Handle delete order
  const handleDelete = (id) => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please log in to manage your orders.");
      return;
    }

    axios.delete(`${ORDER_SERVICE_URL}/api/orders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(() => {
        setError("");
        setOrders(prevOrders => prevOrders.filter(order => order._id !== id));
      })
      .catch((error) => {
        console.error("Error deleting order:", error);
        setError(error.response?.data?.message || "Failed to delete order.");
      });
  };

  if (loading) {
    return (
      <div className="container text-center my-5">
        <Spinner animation="border" role="status" />
        <p className="mt-3">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h2 className="my-2">Your Orders</h2>
        <Link to="/orders/new">
          <Button variant="success">Create New Order</Button>
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-5">
          <h5>You have not placed any orders yet.</h5>
          <p className="text-muted">Browse the menu and add your favourite dishes to get started.</p>
          <Link to="/customer/home">
            <Button variant="primary">Go to Menu</Button>
          </Link>
        </div>
      ) : (
        orders.map((order) => {
          const formattedDate = order.createdAt ? new Date(order.createdAt).toLocaleString() : "";
          return (
            <div key={order._id} className="bg-white rounded-3 shadow-sm p-4 mb-4">
              <div className="d-flex flex-column flex-md-row justify-content-between gap-3">
                <div>
                  <h5 className="mb-1">Order placed on {formattedDate || "Unknown date"}</h5>
                  {order.customerName && (
                    <p className="mb-1 text-muted">Customer: {order.customerName}</p>
                  )}
                  {order.customerPhone && (
                    <p className="mb-1 text-muted">Phone: {order.customerPhone}</p>
                  )}
                  <p className="mb-1 text-muted">
                    Restaurant: {order.restaurantName || "Selected restaurant"}
                  </p>
                  <p className="mb-0 text-muted">
                    Delivery address: {order.deliveryAddress}
                  </p>
                </div>
                <div className="text-md-end">
                  <div className="d-flex flex-wrap gap-2 justify-content-md-end">
                    <Badge bg={order.paymentStatus === "Paid" ? "success" : order.paymentStatus === "Failed" ? "danger" : "warning"}>
                      {order.paymentStatus || "Pending"}
                    </Badge>
                    <Badge bg="info">{order.status || "Pending"}</Badge>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                {order.items.map((item, index) => (
                  <div
                    key={`${order._id}-${index}`}
                    className="d-flex justify-content-between align-items-center py-2 border-bottom"
                  >
                    <div>
                      <strong>{item.foodName || "Menu item"}</strong>
                      <div className="text-muted small">
                        Quantity: {item.quantity || 1} × Rs. {item.price}
                      </div>
                    </div>
                    <div className="fw-semibold">
                      Rs. {(item.price || 0) * (item.quantity || 1)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mt-3 gap-3">
                <div className="fw-bold fs-5">Total: Rs. {order.totalPrice}</div>
                <div className="d-flex gap-2">
                  <Link to={`/orders/edit/${order._id}`}>
                    <Button variant="outline-secondary" size="sm">
                      Update
                    </Button>
                  </Link>
                  <Button variant="outline-danger" size="sm" onClick={() => handleDelete(order._id)}>
                    Cancel Order
                  </Button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default Orders;
