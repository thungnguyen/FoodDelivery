import React, { useState, useEffect, useContext } from "react";
import axios from "axios";
import { ORDER_SERVICE_URL, AUTH_SERVICE_URL } from "../utils/serviceUrls";
import { useNavigate } from "react-router-dom";
import { Button, Form, Spinner } from "react-bootstrap";
import { BsArrowLeftCircle } from "react-icons/bs";
import { CartContext } from "../pages/contexts/CartContext";

function OrderForm({ addOrder }) {
  const { cartItems, clearCart } = useContext(CartContext);
  const navigate = useNavigate();

  const [customerInfo, setCustomerInfo] = useState(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem("token");

  // Fetch customer profile on mount
  useEffect(() => {
    const fetchCustomerProfile = async () => {
      if (!token) {
        alert("Please login first");
        navigate("/auth/login");
        return;
      }

      try {
        const res = await axios.get(`${AUTH_SERVICE_URL}/api/auth/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCustomerInfo(res.data.data.customer);
        setDeliveryAddress(res.data.data.customer.location || "");
      } catch (error) {
        console.error("Error fetching customer profile:", error);
        alert("Failed to load customer profile");
      }
    };

    fetchCustomerProfile();
  }, [token, navigate]);

  // Redirect if cart is empty
  useEffect(() => {
    if (cartItems.length === 0) {
      alert("Your cart is empty!");
      navigate("/customer/home");
    }
  }, [cartItems, navigate]);

  // Calculate total price with quantities
  const totalPrice = cartItems.reduce(
    (total, item) => total + (item.price || 0) * (item.quantity || 1),
    0
  );

  const validateDeliveryAddress = (value) => {
    if (!value.trim()) {
      return "Delivery Address is required.";
    }
    if (value.trim().length < 10) {
      return "Address must be at least 10 characters long.";
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validate delivery address
    const addressError = validateDeliveryAddress(deliveryAddress);
    if (addressError) {
      setErrors({ deliveryAddress: addressError });
      setLoading(false);
      return;
    }

    // Get restaurant ID from first cart item (assuming all items from same restaurant)
    const restaurantId = cartItems[0]?.restaurant;
    const restaurantName = cartItems[0]?.restaurantName || "";

    // Save order data to localStorage for checkout page
    const orderData = {
      customerId: customerInfo.id,
      restaurantId: restaurantId,
      items: cartItems.map(item => ({
        foodId: item._id,
        foodName: item.name,
        quantity: item.quantity || 1,
        price: item.price
      })),
      totalPrice: totalPrice,
      deliveryAddress: deliveryAddress,
      restaurantName,
      customerName: `${customerInfo.firstName} ${customerInfo.lastName}`,
      customerEmail: customerInfo.email,
      customerPhone: customerInfo.phone,
    };

    localStorage.setItem("pendingOrder", JSON.stringify(orderData));

    // Navigate to checkout page
    navigate("/checkout");
    setLoading(false);
  };

  if (!customerInfo) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <Spinner animation="border" />
        <p>Loading customer information...</p>
      </div>
    );
  }

  return (
    <div
      className="container"
      style={{
        padding: "20px",
        backgroundColor: "#f0f4f8",
        minHeight: "100vh",
      }}
    >
      {/* Back Button */}
      <Button
        variant="link"
        onClick={() => navigate("/customer/cart")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "16px",
          color: "#333",
          marginBottom: "20px",
          textDecoration: "none",
        }}
      >
        <BsArrowLeftCircle size={22} /> Back to Cart
      </Button>

      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: "700px",
          margin: "0 auto",
          padding: "30px",
          backgroundColor: "white",
          borderRadius: "8px",
          boxShadow: "0 4px 10px rgba(0, 0, 0, 0.1)",
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: "30px", color: "#333" }}>
          📦 Order Summary
        </h2>

        {/* Customer Info */}
        <div style={{ marginBottom: "25px", padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "6px" }}>
          <h5 style={{ marginBottom: "10px", color: "#555" }}>👤 Customer Information</h5>
          <p style={{ margin: "5px 0" }}><strong>Name:</strong> {customerInfo.firstName} {customerInfo.lastName}</p>
          <p style={{ margin: "5px 0" }}><strong>Email:</strong> {customerInfo.email}</p>
          <p style={{ margin: "5px 0" }}><strong>Phone:</strong> {customerInfo.phone}</p>
        </div>

        {/* Order Items */}
        <div style={{ marginBottom: "25px" }}>
          <h5 style={{ marginBottom: "15px", color: "#555" }}>🍽️ Order Items</h5>
          {cartItems.map((item, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px",
                marginBottom: "10px",
                backgroundColor: "#f8f9fa",
                borderRadius: "6px",
              }}
            >
              <div>
                <strong>{item.name}</strong>
                <p style={{ margin: "5px 0", fontSize: "14px", color: "#666" }}>{item.description}</p>
                <p style={{ margin: "2px 0", fontSize: "14px", color: "#555" }}>Quantity: {item.quantity || 1}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>Rs. {(item.price || 0) * (item.quantity || 1)}</strong>
                <div style={{ fontSize: "12px", color: "#888" }}>
                  ({item.quantity || 1} x Rs. {item.price})
                </div>
              </div>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "15px",
              marginTop: "15px",
              backgroundColor: "#fff3cd",
              borderRadius: "6px",
              fontSize: "18px",
              fontWeight: "bold",
            }}
          >
            <span>Total:</span>
            <span>Rs. {totalPrice}</span>
          </div>
        </div>

        <Form onSubmit={handleSubmit}>
          {/* Delivery Address */}
          <Form.Group style={{ marginBottom: "25px" }}>
            <Form.Label style={{ fontWeight: "600", color: "#555" }}>📍 Delivery Address</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={deliveryAddress}
              onChange={(e) => {
                setDeliveryAddress(e.target.value);
                setErrors({
                  ...errors,
                  deliveryAddress: validateDeliveryAddress(e.target.value),
                });
              }}
              placeholder="Enter your full delivery address..."
              required
            />
            {errors.deliveryAddress && (
              <div style={{ color: "red", fontSize: "14px", marginTop: "5px" }}>
                {errors.deliveryAddress}
              </div>
            )}
          </Form.Group>

          {/* Submit Button */}
          <Button
            variant="primary"
            type="submit"
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "18px",
              fontWeight: "600",
              backgroundColor: "#28a745",
              borderColor: "#28a745",
            }}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner animation="border" size="sm" /> Placing Order...
              </>
            ) : (
              "Proceed to Checkout 💳"
            )}
          </Button>
        </Form>
      </div>
    </div>
  );
}

export default OrderForm;
