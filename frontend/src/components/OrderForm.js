import React, { useState, useEffect, useContext, useMemo } from "react";
import axios from "axios";
import { ORDER_SERVICE_URL, AUTH_SERVICE_URL, PROMOTION_SERVICE_URL } from "../utils/serviceUrls";
import { useNavigate } from "react-router-dom";
import { Button, Form, Spinner } from "react-bootstrap";
import { BsArrowLeftCircle } from "react-icons/bs";
import { CartContext } from "../pages/contexts/CartContext";
import { getAuthToken, AUTH_ROLES } from "../utils/authTokens";
import { computeShippingFee, roundCurrency } from "../utils/pricing";
import { getSavedPromotions, subscribePromotionChanges } from "../utils/promotionStorage";
import CustomerLayout from "./customer/CustomerLayout";

const formatCurrency = (value = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0 VND";
  }
  return `${numeric.toLocaleString("vi-VN")} VND`;
};

function OrderForm({ addOrder }) {
  const { cartItems, clearCart } = useContext(CartContext);
  const navigate = useNavigate();

  const [customerInfo, setCustomerInfo] = useState(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promotionState, setPromotionState] = useState({ loading: false, applied: null, error: "" });
  const [savedPromotions, setSavedPromotions] = useState(() => getSavedPromotions());
  const token = getAuthToken(AUTH_ROLES.CUSTOMER);

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

  useEffect(() => {
    setSavedPromotions(getSavedPromotions());
    const unsubscribe = subscribePromotionChanges((list) => {
      setSavedPromotions(Array.isArray(list) ? list : getSavedPromotions());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const cartRestaurants = useMemo(() => {
    const map = new Map();
    cartItems.forEach((item) => {
      const raw = item.restaurantId || item.restaurant || item.restaurant?._id;
      const id =
        (typeof raw === "object" ? raw._id || raw.id || raw.toString?.() : raw) || null;
      if (!id) {
        return;
      }
      if (!map.has(id)) {
        map.set(id, {
          restaurantId: id,
          restaurantName: item.restaurantName || item.restaurant?.name || "",
        });
      }
    });
    return Array.from(map.values());
  }, [cartItems]);

  const singleRestaurant = cartRestaurants.length <= 1;
  const primaryRestaurant = cartRestaurants[0] || { restaurantId: null, restaurantName: "" };
  const primaryRestaurantId = singleRestaurant ? primaryRestaurant.restaurantId : null;
  const primaryRestaurantName = singleRestaurant ? primaryRestaurant.restaurantName : "";

  const describePromotionValue = (promotion) => {
    if (!promotion) {
      return "";
    }
    const type = (promotion.type || "").toUpperCase();
    if (type === "PERCENT") {
      const percentValue = roundCurrency(promotion.value || 0);
      return `${percentValue}%`;
    }
    const fixedValue =
      promotion.value ??
      promotion.maxDiscount ??
      promotion.discountAmount ??
      0;
    return formatCurrency(fixedValue);
  };

  // Calculate total price with quantities
  const itemsTotal = cartItems.reduce(
    (total, item) => total + (item.price || 0) * (item.quantity || 1),
    0
  );
  const roundedItemsTotal = roundCurrency(itemsTotal);
  const shippingFee = roundCurrency(computeShippingFee(cartItems));
  const appliedPromotion = promotionState.applied;
  const discountAmount = appliedPromotion?.discountAmount
    ? roundCurrency(appliedPromotion.discountAmount)
    : 0;
  const grandTotal = roundCurrency(roundedItemsTotal + shippingFee);
  const finalTotal = roundCurrency(Math.max(0, grandTotal - discountAmount));
  const eligibleSavedPromotions = useMemo(() => {
    if (!singleRestaurant) {
      return [];
    }
    const list = Array.isArray(savedPromotions) ? savedPromotions : [];
    if (!list.length) {
      return [];
    }
    const targetId = primaryRestaurantId
      ? primaryRestaurantId.toString?.() || primaryRestaurantId
      : null;
    const now = Date.now();
    return list
      .filter((promo) => {
        if (!promo?.code) {
          return false;
        }
        if (promo.restaurantId) {
          const promoRestaurantId =
            typeof promo.restaurantId === "object"
              ? promo.restaurantId._id ||
                promo.restaurantId.id ||
                promo.restaurantId.toString?.()
              : promo.restaurantId;
          if (!targetId || !promoRestaurantId) {
            return false;
          }
          if (promoRestaurantId.toString() !== targetId.toString()) {
            return false;
          }
        }
        const minOrder = Number(promo.minOrder);
        if (Number.isFinite(minOrder) && minOrder > 0 && grandTotal < minOrder) {
          return false;
        }
        const status = (promo.status || "").toUpperCase();
        if (status && ["INACTIVE", "EXPIRED"].includes(status)) {
          return false;
        }
        if (promo.endDate) {
          const end = new Date(promo.endDate);
          if (!Number.isNaN(end.getTime()) && end.getTime() < now) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(a.savedAt || 0).getTime();
        const bTime = new Date(b.savedAt || 0).getTime();
        return bTime - aTime;
      });
  }, [savedPromotions, singleRestaurant, primaryRestaurantId, grandTotal]);
  const hasEligibleSavedPromotions = eligibleSavedPromotions.length > 0;

  const validateDeliveryAddress = (value) => {
    if (!value.trim()) {
      return "Delivery Address is required.";
    }
    if (value.trim().length < 10) {
      return "Address must be at least 10 characters long.";
    }
    return "";
  };

  const handleApplyPromotion = async (codeOverride) => {
    const candidateCode = codeOverride ?? promoCode;
    const nextCode = ((candidateCode || "")).trim();
    if (!nextCode) {
      setPromotionState((prev) => ({ ...prev, error: "Vui lòng nhập mã khuyến mãi." }));
      return;
    }
    if (!singleRestaurant) {
      setPromotionState({
        loading: false,
        applied: null,
        error: "Mã khuyến mãi chỉ áp dụng khi đơn thuộc một nhà hàng.",
      });
      return;
    }
    setPromotionState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const { data } = await axios.post(`${PROMOTION_SERVICE_URL}/api/promotions/validate`, {
        code: nextCode,
        restaurantId: primaryRestaurantId,
        orderTotal: grandTotal,
      });
      const computedDiscount = roundCurrency(Number(data?.discountAmount || 0));
      if (!computedDiscount) {
        setPromotionState({
          loading: false,
          applied: null,
          error: "Mã khuyến mãi không tạo ra ưu đãi cho đơn này.",
        });
        return;
      }
      setPromotionState({
        loading: false,
        applied: { ...data, discountAmount: computedDiscount },
        error: "",
      });
      setPromoCode(data?.code || nextCode);
    } catch (error) {
      setPromotionState({
        loading: false,
        applied: null,
        error: error.response?.data?.message || "Không thể áp dụng mã khuyến mãi.",
      });
    }
  };

  const handleRemovePromotion = () => {
    setPromotionState({ loading: false, applied: null, error: "" });
    setPromoCode("");
  };

  const handleUseSavedPromotion = (promotion) => {
    if (!promotion?.code) {
      return;
    }
    setPromoCode(promotion.code);
    handleApplyPromotion(promotion.code);
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

    const normalizedItems = cartItems.map(item => ({
      foodId: item._id,
      foodName: item.name,
      restaurantId: item.restaurant || item.restaurantId,
      restaurantName: item.restaurantName || "",
      quantity: item.quantity || 1,
      price: item.price || 0,
    })).filter(item => item.foodId && item.restaurantId);

    if (!normalizedItems.length) {
      alert("Giỏ hàng không hợp lệ. Vui lòng thêm món lại.");
      setLoading(false);
      return;
    }

    // Save order data to localStorage for checkout page
    const orderData = {
      customerId: customerInfo.id,
      customerName: `${customerInfo.firstName} ${customerInfo.lastName}`,
      customerEmail: customerInfo.email,
      customerPhone: customerInfo.phone,
      restaurantId: primaryRestaurantId,
      restaurantName: primaryRestaurantName,
      items: normalizedItems,
      cartItems: normalizedItems,
      itemsTotal: roundedItemsTotal,
      shippingFee,
      totalPrice: finalTotal,
      deliveryAddress: deliveryAddress,
      promotionCode: appliedPromotion?.code || "",
      promotionDiscount: discountAmount,
      promotionDetails: appliedPromotion,
    };

    localStorage.setItem("pendingOrder", JSON.stringify(orderData));

    // Navigate to checkout page
    navigate("/checkout");
    setLoading(false);
  };

  const customerDisplayName = customerInfo
    ? `${customerInfo.firstName || ""} ${customerInfo.lastName || ""}`.trim() || customerInfo.email
    : undefined;

  if (!customerInfo) {
    return (
      <CustomerLayout customerName={customerDisplayName}>
        <div style={{ padding: "40px", textAlign: "center" }}>
          <Spinner animation="border" />
          <p>Loading customer information...</p>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout customerName={customerDisplayName}>
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
              flexDirection: "column",
              gap: "8px",
              padding: "15px",
              marginTop: "15px",
              backgroundColor: "#fff3cd",
              borderRadius: "6px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "16px",
              }}
            >
              <span>Subtotal:</span>
              <span>{roundedItemsTotal} VND</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "16px",
              }}
            >
              <span>Shipping:</span>
              <span>{shippingFee} VND</span>
            </div>
            {discountAmount > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "16px",
                  color: "#16a34a",
                  fontWeight: 600,
                }}
              >
                <span>Discount:</span>
                <span>-{discountAmount} VND</span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "18px",
                fontWeight: "bold",
              }}
            >
              <span>Total:</span>
              <span>{finalTotal} VND</span>
            </div>
          </div>
        </div>

        {/* Promotion */}
        <div style={{ marginBottom: "25px", padding: "15px", backgroundColor: "#eef2ff", borderRadius: "6px" }}>
          <h5 style={{ marginBottom: "10px", color: "#4338ca" }}>🎁 Promotion Code</h5>
          {!singleRestaurant && (
            <p style={{ color: "#b45309", fontSize: "14px", marginBottom: "8px" }}>
              Hiện chỉ hỗ trợ áp dụng mã khi đơn thuộc một nhà hàng. Vui lòng tách đơn nếu cần.
            </p>
          )}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input
              type="text"
              className="text-input"
              placeholder="Nhập mã khuyến mãi"
              value={promoCode}
              onChange={(event) => {
                setPromoCode(event.target.value);
                setPromotionState((prev) => ({ ...prev, error: "" }));
              }}
              style={{ flex: 1 }}
              disabled={promotionState.loading}
            />
            {appliedPromotion ? (
              <button
                type="button"
                onClick={handleRemovePromotion}
                className="form-secondary"
                style={{ whiteSpace: "nowrap" }}
              >
                Bỏ mã
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApplyPromotion}
                className="form-primary"
                disabled={promotionState.loading || !promoCode.trim()}
                style={{ whiteSpace: "nowrap" }}
              >
                {promotionState.loading ? "Đang kiểm tra..." : "Áp dụng"}
              </button>
            )}
          </div>
          {promotionState.error && (
            <p style={{ color: "#dc2626", marginTop: "8px" }}>{promotionState.error}</p>
          )}
          {hasEligibleSavedPromotions && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                backgroundColor: "#f0fdf4",
                borderRadius: "10px",
                border: "1px solid #bbf7d0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <span style={{ fontWeight: 600, color: "#166534" }}>
                  Hoặc chọn mã đã lưu cho {primaryRestaurantName || "đơn này"}
                </span>
                <span style={{ fontSize: "13px", color: "#15803d" }}>
                  {eligibleSavedPromotions.length} mã khả dụng
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {eligibleSavedPromotions.map((promotion) => {
                  const isActive = appliedPromotion?.code === promotion.code;
                  return (
                    <button
                      key={`${promotion.code}-${promotion.restaurantId || "any"}`}
                      type="button"
                      onClick={() => handleUseSavedPromotion(promotion)}
                      disabled={promotionState.loading}
                      style={{
                        flex: "1 1 220px",
                        minWidth: "200px",
                        border: isActive ? "2px solid #16a34a" : "1px solid #e2e8f0",
                        backgroundColor: isActive ? "#dcfce7" : "#fff",
                        borderRadius: "12px",
                        padding: "12px",
                        textAlign: "left",
                        boxShadow: "0 10px 18px rgba(15,23,42,0.08)",
                        cursor: promotionState.loading ? "not-allowed" : "pointer",
                        opacity: promotionState.loading ? 0.7 : 1,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "6px",
                        }}
                      >
                        <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "15px" }}>
                          {promotion.code}
                        </span>
                        <span style={{ fontSize: "12px", color: isActive ? "#15803d" : "#475569" }}>
                          {isActive ? "Đang áp dụng" : "Áp dụng"}
                        </span>
                      </div>
                      <div style={{ color: "#475569", fontSize: "14px" }}>
                        Giảm {describePromotionValue(promotion)}
                      </div>
                      {Number(promotion.minOrder) > 0 ? (
                        <div style={{ color: "#52606d", fontSize: "12px", marginTop: "4px" }}>
                          Đơn tối thiểu {formatCurrency(Number(promotion.minOrder))}
                        </div>
                      ) : null}
                      {promotion.restaurantName ? (
                        <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "4px" }}>
                          {promotion.restaurantName}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
            {appliedPromotion && (
              <div style={{ marginTop: "10px", padding: "10px", backgroundColor: "#ecfccb", borderRadius: "6px" }}>
                <div>
                  <strong>{appliedPromotion.code}</strong>{" "}
                  <span style={{ color: "#166534" }}>• Giảm {describePromotionValue(appliedPromotion)}</span>
                </div>
                {appliedPromotion.maxDiscount && appliedPromotion.type === "PERCENT" && (
                  <small style={{ display: "block", color: "#4d7c0f" }}>
                    Tối đa {formatCurrency(appliedPromotion.maxDiscount)}
                  </small>
                )}
                <div>Tiết kiệm: {formatCurrency(discountAmount)}</div>
              </div>
            )}
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
    </CustomerLayout>
  );
}

export default OrderForm;
