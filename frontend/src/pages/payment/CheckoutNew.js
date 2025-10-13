import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardNumberElement, CardExpiryElement, CardCvcElement } from "@stripe/react-stripe-js";
import axios from "axios";
import { Button, Spinner } from "react-bootstrap";
import { BsArrowLeftCircle, BsCreditCard, BsCash } from "react-icons/bs";
import "../../styles/checkout.css";
import { PAYMENT_SERVICE_URL, ORDER_SERVICE_URL } from "../../utils/serviceUrls";
import { CartContext } from "../contexts/CartContext";

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const CheckoutFormInner = () => {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { clearCart } = useContext(CartContext);

  const [orderData, setOrderData] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("card"); // "card" or "cash"
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Load pending order from localStorage
    const pendingOrder = localStorage.getItem("pendingOrder");
    if (!pendingOrder) {
      alert("No order found. Please create an order first.");
      navigate("/customer/home");
      return;
    }
    setOrderData(JSON.parse(pendingOrder));
  }, [navigate]);

  // Create payment intent for card payment
  const createPaymentIntent = async () => {
    if (!orderData) return;

    try {
      const paymentData = {
        orderId: `ORD${Date.now()}`,
        userId: orderData.customerId,
        amount: orderData.totalPrice,
        currency: "usd",
        firstName: orderData.customerName.split(" ")[0],
        lastName: orderData.customerName.split(" ").slice(1).join(" "),
        email: orderData.customerEmail,
        phone: orderData.customerPhone,
      };

      const response = await axios.post(`${PAYMENT_SERVICE_URL}/api/payment/process`, paymentData);

      if (response.data.clientSecret) {
        setClientSecret(response.data.clientSecret);
      } else {
        setError("⚠️ No valid payment secret found.");
      }
    } catch (err) {
      console.error("Error creating PaymentIntent", err);
      setError("❌ Failed to create payment. Please try again.");
    }
  };

  // Handle card payment
  const handleCardPayment = async () => {
    if (!stripe || !elements || !clientSecret) {
      setError("⚠️ Payment not ready.");
      return false;
    }

    const cardElement = elements.getElement(CardNumberElement);
    const { error, paymentMethod: pm } = await stripe.createPaymentMethod({
      type: "card",
      card: cardElement,
      billing_details: {
        name: orderData.customerName,
        email: orderData.customerEmail,
      },
    });

    if (error) {
      setError(error.message);
      return false;
    }

    const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: pm.id,
    });

    if (confirmError) {
      setError(confirmError.message);
      return false;
    }

    if (paymentIntent.status === "succeeded") {
      return true;
    }

    return false;
  };

  // Handle order submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let paymentSuccess = false;

      // If card payment, process stripe payment first
      if (paymentMethod === "card") {
        paymentSuccess = await handleCardPayment();
        if (!paymentSuccess) {
          setLoading(false);
          return;
        }
      } else {
        // Cash payment - no need to process payment
        paymentSuccess = true;
      }

      // Create order in backend
      const token = localStorage.getItem("token");
      const orderPayload = {
        customerId: orderData.customerId,
        restaurantId: orderData.restaurantId,
        items: orderData.items,
        totalPrice: orderData.totalPrice,
        deliveryAddress: orderData.deliveryAddress,
        paymentMethod: paymentMethod,
        paymentStatus: paymentMethod === "card" ? "paid" : "pending",
        status: "pending", // Initial order status
      };

      const response = await axios.post(`${ORDER_SERVICE_URL}/api/orders`, orderPayload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Clear cart and pending order
      clearCart();
      localStorage.removeItem("pendingOrder");

      setMessage("✅ Order placed successfully!");

      setTimeout(() => {
        navigate("/customer/orders");
      }, 2000);

    } catch (error) {
      console.error("Error creating order:", error);
      setError(error.response?.data?.message || "Failed to create order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Trigger payment intent creation when switching to card
  useEffect(() => {
    if (paymentMethod === "card" && orderData && !clientSecret) {
      createPaymentIntent();
    }
  }, [paymentMethod, orderData]);

  if (!orderData) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <Spinner animation="border" />
        <p>Loading order...</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: "20px", backgroundColor: "#f0f4f8", minHeight: "100vh" }}>
      {/* Back Button */}
      <Button
        variant="link"
        onClick={() => navigate("/orders/new")}
        style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", color: "#333", marginBottom: "20px", textDecoration: "none" }}
      >
        <BsArrowLeftCircle size={22} /> Back to Order Summary
      </Button>

      <div style={{ maxWidth: "800px", margin: "0 auto", backgroundColor: "white", padding: "30px", borderRadius: "8px", boxShadow: "0 4px 10px rgba(0, 0, 0, 0.1)" }}>
        <h2 style={{ textAlign: "center", marginBottom: "30px", color: "#333" }}>💳 Checkout</h2>

        {/* Order Summary */}
        <div style={{ marginBottom: "30px", padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "6px" }}>
          <h5 style={{ marginBottom: "15px", color: "#555" }}>📦 Order Summary</h5>
          {orderData.items.map((item, index) => (
            <div key={index} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
              <span>{item.foodName}</span>
              <span>Rs. {item.price}</span>
            </div>
          ))}
          <hr />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "18px" }}>
            <span>Total:</span>
            <span>Rs. {orderData.totalPrice}</span>
          </div>
        </div>

        {/* Payment Method Selection */}
        <div style={{ marginBottom: "25px" }}>
          <h5 style={{ marginBottom: "15px", color: "#555" }}>Select Payment Method</h5>
          <div style={{ display: "flex", gap: "15px" }}>
            <Button
              variant={paymentMethod === "card" ? "primary" : "outline-primary"}
              onClick={() => setPaymentMethod("card")}
              style={{ flex: 1, padding: "15px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}
            >
              <BsCreditCard size={20} /> Credit/Debit Card
            </Button>
            <Button
              variant={paymentMethod === "cash" ? "success" : "outline-success"}
              onClick={() => setPaymentMethod("cash")}
              style={{ flex: 1, padding: "15px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}
            >
              <BsCash size={20} /> Cash on Delivery
            </Button>
          </div>
        </div>

        {/* Card Payment Form */}
        {paymentMethod === "card" && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "600" }}>Card Number</label>
              <div style={{ padding: "12px", border: "1px solid #ddd", borderRadius: "4px" }}>
                <CardNumberElement />
              </div>
            </div>
            <div style={{ display: "flex", gap: "15px", marginBottom: "20px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "600" }}>Expiry Date</label>
                <div style={{ padding: "12px", border: "1px solid #ddd", borderRadius: "4px" }}>
                  <CardExpiryElement />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "600" }}>CVC</label>
                <div style={{ padding: "12px", border: "1px solid #ddd", borderRadius: "4px" }}>
                  <CardCvcElement />
                </div>
              </div>
            </div>
            <Button type="submit" disabled={!stripe || loading} style={{ width: "100%", padding: "14px", fontSize: "18px", fontWeight: "600" }}>
              {loading ? <><Spinner animation="border" size="sm" /> Processing...</> : "Place Order & Pay"}
            </Button>
          </form>
        )}

        {/* Cash Payment */}
        {paymentMethod === "cash" && (
          <div>
            <div style={{ padding: "20px", backgroundColor: "#fff3cd", borderRadius: "6px", marginBottom: "20px" }}>
              <p style={{ margin: 0, color: "#856404" }}>
                <strong>Note:</strong> Please prepare exact change. Payment will be collected upon delivery.
              </p>
            </div>
            <Button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "14px", fontSize: "18px", fontWeight: "600", backgroundColor: "#28a745", borderColor: "#28a745" }}>
              {loading ? <><Spinner animation="border" size="sm" /> Processing...</> : "Place Order (Cash on Delivery)"}
            </Button>
          </div>
        )}

        {error && <div style={{ color: "red", marginTop: "15px", textAlign: "center" }}>{error}</div>}
        {message && <div style={{ color: "green", marginTop: "15px", textAlign: "center", fontWeight: "bold" }}>{message}</div>}
      </div>
    </div>
  );
};

const CheckoutNew = () => {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutFormInner />
    </Elements>
  );
};

export default CheckoutNew;
