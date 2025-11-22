import React, { useState, useEffect, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  useStripe,
  useElements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
} from "@stripe/react-stripe-js";
import axios from "axios";
import { Spinner } from "react-bootstrap";
import { BsArrowLeftCircle, BsCreditCard, BsQrCode } from "react-icons/bs";
import "../../styles/checkout.css";
import { PAYMENT_SERVICE_URL, ORDER_SERVICE_URL } from "../../utils/serviceUrls";
import { CartContext } from "../contexts/CartContext";
import { getAuthToken, AUTH_ROLES } from "../../utils/authTokens";
import { computeShippingFee, roundCurrency } from "../../utils/pricing";
import CustomerLayout from "../../components/customer/CustomerLayout";

const publishableKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
const hasStripeKey = Boolean(publishableKey);
const stripePromise = hasStripeKey ? loadStripe(publishableKey) : null;

const PAYMENT_METHODS = [
  { key: "card", label: "Thẻ quốc tế (Visa/Mastercard)", icon: <BsCreditCard size={18} /> },
  { key: "vietqr", label: "Chuyển khoản VietQR", icon: <BsQrCode size={18} /> },
  { key: "cash", label: "Thanh toán tiền mặt", icon: <span role="img" aria-label="cash">💵</span> },
];

const BANKS = [
  {
    code: "VCB",
    name: "Vietcombank",
    shortName: "VCB",
    accountNumber: "00123456789",
    accountName: "CONG TY SKYDISH",
    branch: "Chi nhánh Hà Nội",
  },
  {
    code: "ACB",
    name: "Ngân hàng ACB",
    shortName: "ACB",
    accountNumber: "8686868686",
    accountName: "CONG TY SKYDISH",
    branch: "Chi nhánh TP.HCM",
  },
  {
    code: "BIDV",
    name: "BIDV",
    shortName: "BIDV",
    accountNumber: "1234567890",
    accountName: "CONG TY SKYDISH",
    branch: "Chi nhánh Bình Thạnh",
  },
  {
    code: "TCB",
    name: "Techcombank",
    shortName: "TCB",
    accountNumber: "1900123456788",
    accountName: "CONG TY SKYDISH",
    branch: "Chi nhánh Phú Mỹ Hưng",
  },
];

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);

const CheckoutFormInner = () => {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const { clearCart } = useContext(CartContext);

  const [orderData, setOrderData] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [clientSecret, setClientSecret] = useState("");
  const [paymentRecordId, setPaymentRecordId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [selectedBank, setSelectedBank] = useState(BANKS[0]);
  const [copyStatus, setCopyStatus] = useState("");

  const customerDisplayName = useMemo(() => {
    const explicitName = (orderData?.customerName || "").trim();
    if (explicitName) {
      return explicitName;
    }
    return orderData?.customerEmail || undefined;
  }, [orderData]);

  useEffect(() => {
    const pendingOrder = localStorage.getItem("pendingOrder");
    if (!pendingOrder) {
      alert("Không tìm thấy đơn hàng. Vui lòng đặt hàng lại.");
      navigate("/customer/home");
      return;
    }
    try {
      const parsed = JSON.parse(pendingOrder);
      const cartItems = Array.isArray(parsed.cartItems) && parsed.cartItems.length
        ? parsed.cartItems
        : Array.isArray(parsed.items)
          ? parsed.items
          : [];
      const derivedItemsTotal = roundCurrency(
        parsed.itemsTotal ??
          cartItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
      );
      const derivedShipping = roundCurrency(parsed.shippingFee ?? computeShippingFee(cartItems));
      const storedDiscount = roundCurrency(
        parsed.promotionDiscount || parsed?.promotionDetails?.discountAmount || 0
      );
      const baseTotal = roundCurrency(derivedItemsTotal + derivedShipping);
      const payable = roundCurrency(Math.max(0, baseTotal - storedDiscount));

      setOrderData({
        ...parsed,
        cartItems,
        items: cartItems,
        itemsTotal: roundCurrency(derivedItemsTotal),
        shippingFee: roundCurrency(derivedShipping),
        totalPrice: payable,
        promotionCode: parsed.promotionCode || parsed?.promotionDetails?.code || "",
        promotionDiscount: storedDiscount,
        promotionDetails: parsed.promotionDetails || null,
      });
    } catch (err) {
      console.error("Failed to parse pending order from storage", err);
      localStorage.removeItem("pendingOrder");
      alert("Dữ liệu đơn hàng lỗi. Vui lòng tạo lại đơn hàng.");
      navigate("/customer/home");
    }
  }, [navigate]);

  const totals = useMemo(() => {
    if (!orderData) {
      return { items: 0, shipping: 0, discount: 0, grand: 0 };
    }
    const sourceItems = Array.isArray(orderData.cartItems) && orderData.cartItems.length
      ? orderData.cartItems
      : Array.isArray(orderData.items)
        ? orderData.items
        : [];
    const items = roundCurrency(
      orderData.itemsTotal ??
        sourceItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
    );
    const shipping = roundCurrency(orderData.shippingFee ?? computeShippingFee(sourceItems));
    const discount = roundCurrency(orderData.promotionDiscount || 0);
    return {
      items,
      shipping,
      discount,
      grand: roundCurrency(Math.max(0, items + shipping - discount)),
    };
  }, [orderData]);

  const qrUrl = useMemo(() => {
    if (!orderData) return "";
    const addInfo = encodeURIComponent(orderData.orderId || `SKYDISH-${orderData.customerId || ""}`);
    return `https://img.vietqr.io/image/${selectedBank.shortName}-${selectedBank.accountNumber}-compact2.png?amount=${totals.grand}&addInfo=${addInfo}`;
  }, [orderData, selectedBank, totals.grand]);

  const createPaymentIntent = async () => {
    if (!orderData) return;
    try {
      const fullName = (orderData.customerName || "").trim();
      const [first = "Khach", ...rest] = fullName.length ? fullName.split(" ") : ["Khach"];
      const last = rest.length ? rest.join(" ") : first;

      const cartItemsForPayment = (orderData.cartItems || orderData.items || []).map((item) => ({
        foodId: item.foodId || item._id,
        foodName: item.foodName || item.name,
        restaurantId: resolveRestaurantId(item),
        restaurantName: item.restaurantName || item.restaurant?.name || "",
        quantity: item.quantity || 1,
        price: item.price || 0,
      })).filter((item) => item.foodId && item.restaurantId);

      const paymentData = {
        orderId: `ORD${Date.now()}`,
        userId: orderData.customerId,
        amount: totals.grand,
        currency: "usd",
        firstName: first,
        lastName: last,
        email: orderData.customerEmail,
        phone: orderData.customerPhone,
        customerName: orderData.customerName,
        deliveryAddress: orderData.deliveryAddress,
        cartItems: cartItemsForPayment,
        itemsTotal: totals.items,
        shippingFee: totals.shipping,
        totalPrice: totals.grand,
      };

      const response = await axios.post(`${PAYMENT_SERVICE_URL}/api/payment/process`, paymentData);
      if (response.data.clientSecret) {
        setClientSecret(response.data.clientSecret);
        setPaymentRecordId(response.data.paymentId || null);
      } else {
        setError("⚠️ Không nhận được khóa thanh toán hợp lệ.");
      }
    } catch (err) {
      console.error("Error creating PaymentIntent", err);
      setError(err.response?.data?.error || "❌ Không thể tạo thanh toán. Vui lòng thử lại.");
    }
  };

  const handleCardPayment = async () => {
    if (!stripe || !elements || !clientSecret) {
      setError("⚠️ Thanh toán chưa sẵn sàng.");
      return { success: false };
    }

    const cardElement = elements.getElement(CardNumberElement);
    const { error: pmError, paymentMethod: pm } = await stripe.createPaymentMethod({
      type: "card",
      card: cardElement,
      billing_details: {
        name: orderData.customerName,
        email: orderData.customerEmail,
      },
    });

    if (pmError) {
      setError(pmError.message);
      return { success: false };
    }

    const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: pm.id,
    });

    if (confirmError) {
      setError(confirmError.message);
      return { success: false };
    }

    return {
      success: paymentIntent.status === "succeeded",
      paymentIntentId: paymentIntent.id,
    };
  };

  const handleCopy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(value);
      setTimeout(() => setCopyStatus(""), 2000);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  const handleSelectPaymentMethod = (methodKey) => {
    if (methodKey === "card" && !hasStripeKey) {
      setError("Thanh toán thẻ cần cấu hình REACT_APP_STRIPE_PUBLISHABLE_KEY (pk_test...) trong frontend/.env.");
      return;
    }
    setPaymentMethod(methodKey);
    setError(null);
    if (methodKey !== "card") {
      setClientSecret("");
      setPaymentRecordId(null);
    }
  };

  const resolveRestaurantId = (item) => {
    const raw =
      item.restaurantId ||
      item.restaurant ||
      item.restaurant?._id ||
      item.restaurant?.id ||
      (typeof item.restaurant === "object" ? item.restaurant?.toString?.() : null);
    if (!raw) {
      return null;
    }
    if (typeof raw === "object") {
      return raw._id || raw.id || raw.toString?.() || null;
    }
    return raw;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let paymentIntentId = null;
      if (paymentMethod === "card") {
        if (!hasStripeKey) {
          setError("Thanh toán thẻ bị tắt vì thiếu REACT_APP_STRIPE_PUBLISHABLE_KEY.");
          setLoading(false);
          return;
        }
        const paymentResult = await handleCardPayment();
        if (!paymentResult.success) {
          setLoading(false);
          return;
        }
        paymentIntentId = paymentResult.paymentIntentId || null;
      }

      const token = getAuthToken(AUTH_ROLES.CUSTOMER);
      const paymentStatusValue = paymentMethod === "card" ? "Paid" : "Pending";

      const cartItemsPayload = (orderData.cartItems || orderData.items || []).map((item) => ({
        foodId: item.foodId || item._id,
        foodName: item.foodName || item.name,
        restaurantId: resolveRestaurantId(item),
        restaurantName: item.restaurantName || item.restaurant?.name || "",
        quantity: item.quantity || 1,
        price: item.price || 0,
      })).filter((item) => item.foodId && item.restaurantId);
      if (!cartItemsPayload.length) {
        throw new Error("Không tìm thấy danh sách món ăn để tạo đơn.");
      }

      const orderPayload = {
        customerId: orderData.customerId,
        customerName: orderData.customerName,
        customerEmail: orderData.customerEmail,
        customerPhone: orderData.customerPhone,
        restaurantId: orderData.restaurantId,
        restaurantName: orderData.restaurantName,
        items: cartItemsPayload,
        cartItems: cartItemsPayload,
        itemsTotal: totals.items,
        shippingFee: totals.shipping,
        totalPrice: totals.grand,
        deliveryAddress: orderData.deliveryAddress,
        paymentMethod,
        paymentStatus: paymentStatusValue,
        status: "Pending",
      };

      if (paymentIntentId) {
        orderPayload.paymentIntentId = paymentIntentId;
      }
      if (paymentRecordId) {
        orderPayload.paymentId = paymentRecordId;
      }
      if (orderData.promotionCode) {
        orderPayload.promotionCode = orderData.promotionCode;
      }

      await axios.post(`${ORDER_SERVICE_URL}/api/orders`, orderPayload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      clearCart();
      localStorage.removeItem("pendingOrder");
      setMessage(
        paymentMethod === "card"
          ? "✅ Thanh toán thành công! Đã tạo đơn riêng cho từng nhà hàng."
          : "✅ Đặt hàng thành công! Hệ thống đã tạo đơn theo từng nhà hàng."
      );
      setTimeout(() => navigate("/customer/orders"), 2000);
    } catch (err) {
      console.error("Error creating order:", err);
      setError(err.response?.data?.message || "Không thể tạo đơn hàng. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (paymentMethod === "card" && orderData && !clientSecret && hasStripeKey) {
      createPaymentIntent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, orderData, clientSecret]);

  if (!orderData) {
    return (
      <CustomerLayout customerName={customerDisplayName}>
        <div style={{ padding: "40px", textAlign: "center" }}>
          <Spinner animation="border" />
          <p>Đang tải dữ liệu đơn hàng...</p>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout customerName={customerDisplayName}>
      <div className="checkout-page">
      <button className="back-link" type="button" onClick={() => navigate("/orders/new")}>
        <BsArrowLeftCircle size={18} /> Quay lại giỏ hàng
      </button>

      <div className="checkout-container">
        <div className="summary-box">
          <div>
            <p className="summary-label">Mã đơn tạm</p>
            <strong>{orderData.orderId || "Chưa tạo"}</strong>
          </div>
          <div>
            <p className="summary-label">Tổng thanh toán</p>
            <strong>{formatCurrency(totals.grand)}</strong>
          </div>
        </div>

        <div className="order-breakdown">
          <h4>Chi tiết món</h4>
          {(orderData.items || []).map((item, index) => (
            <div key={`${item.foodId}-${index}`} className="order-item">
              <div>
                <p className="item-name">{item.foodName}</p>
                <p className="item-qty">x{item.quantity || 1}</p>
              </div>
              <p className="item-price">
                {formatCurrency((item.price || 0) * (item.quantity || 1))}
              </p>
            </div>
          ))}
          <div className="order-total-row">
            <span>Tạm tính</span>
            <strong>{formatCurrency(totals.items)}</strong>
          </div>
          <div className="order-total-row">
            <span>Phí giao hàng</span>
            <strong>{formatCurrency(totals.shipping)}</strong>
          </div>
          {totals.discount > 0 && (
            <div className="order-total-row discount">
              <span>Giảm giá (mã {orderData.promotionCode})</span>
              <strong>-{formatCurrency(totals.discount)}</strong>
            </div>
          )}
          <div className="order-total-row grand">
            <span>Tổng thanh toán</span>
            <strong>{formatCurrency(totals.grand)}</strong>
          </div>
        </div>

        <div className="payment-method-tabs">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.key}
              type="button"
              className={`payment-method-btn ${paymentMethod === method.key ? "active" : ""}`}
              disabled={!hasStripeKey && method.key === "card"}
              onClick={() => handleSelectPaymentMethod(method.key)}
            >
              {method.icon}
              <span>{method.label}</span>
            </button>
          ))}
        </div>

        {paymentMethod === "card" && (
          hasStripeKey ? (
            <form onSubmit={handleSubmit} className="checkout-form">
              <div className="input-group">
                <label>Số thẻ</label>
                <CardNumberElement className="stripe-input" />
              </div>
              <div className="input-row">
                <div className="input-group">
                  <label>Expiry</label>
                  <CardExpiryElement className="stripe-input" />
                </div>
                <div className="input-group">
                  <label>CVC</label>
                  <CardCvcElement className="stripe-input" />
                </div>
              </div>
              <button type="submit" disabled={!stripe || loading} className="checkout-btn">
                {loading ? "Đang xử lý..." : "Thanh toán & đặt hàng"}
              </button>
            </form>
          ) : (
            <div className="checkout-error">
              Thanh toán thẻ đang bị tắt vì thiếu khóa publishable Stripe. Thêm
              `REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_xxx` vào `frontend/.env` rồi chạy lại frontend.
            </div>
          )
        )}

        {paymentMethod === "vietqr" && (
          <div className="vietqr-section">
            <p className="section-title">Chọn ngân hàng chuyển khoản</p>
            <div className="bank-grid">
              {BANKS.map((bank) => (
                <button
                  key={bank.code}
                  type="button"
                  className={`bank-card ${selectedBank.code === bank.code ? "active" : ""}`}
                  onClick={() => setSelectedBank(bank)}
                >
                  <div className="bank-name">{bank.name}</div>
                  <div className="bank-account">{bank.accountNumber}</div>
                </button>
              ))}
            </div>

            <div className="qr-wrapper">
              {qrUrl && <img src={qrUrl} alt="VietQR" className="qr-image" />}
              <div className="bank-details">
                <div className="detail-row">
                  <span>Ngân hàng</span>
                  <strong>{selectedBank.name}</strong>
                </div>
                <div className="detail-row">
                  <span>Số tài khoản</span>
                  <div className="detail-value">
                    <strong>{selectedBank.accountNumber}</strong>
                    <button type="button" className="copy-btn" onClick={() => handleCopy(selectedBank.accountNumber)}>
                      Sao chép
                    </button>
                    {copyStatus === selectedBank.accountNumber && <span className="copy-done">Đã sao chép</span>}
                  </div>
                </div>
                <div className="detail-row">
                  <span>Tên thụ hưởng</span>
                  <strong>{selectedBank.accountName}</strong>
                </div>
                <div className="detail-row">
                  <span>Nội dung</span>
                  <div className="detail-value">
                    <strong>{orderData.orderId || `DH-${orderData.customerId || ""}`}</strong>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() => handleCopy(orderData.orderId || `DH-${orderData.customerId || ""}`)}
                    >
                      Sao chép
                    </button>
                    {copyStatus === (orderData.orderId || `DH-${orderData.customerId || ""}`) && (
                      <span className="copy-done">Đã sao chép</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <ul className="vietqr-note">
              <li>Số tiền: <strong>{formatCurrency(totals.grand)}</strong></li>
              <li>Quét mã bằng app ngân hàng hoặc nhập thông tin ở trên.</li>
              <li>Giữ nguyên nội dung chuyển khoản để hệ thống đối soát.</li>
            </ul>

            <button type="button" className="checkout-btn secondary" onClick={handleSubmit} disabled={loading}>
              {loading ? "Đang xác nhận..." : "Tôi đã chuyển khoản"}
            </button>
          </div>
        )}

        {paymentMethod === "cash" && (
          <div className="vietqr-section">
            <div className="cash-note">
              <p>
                <strong>Thanh toán tiền mặt khi nhận hàng</strong>
              </p>
              <ul>
                <li>Chuẩn bị sẵn số tiền: <strong>{formatCurrency(totals.grand)}</strong></li>
                <li>Tài xế sẽ liên hệ trước khi giao để xác nhận thời gian, vui lòng chuẩn bị tiền lẻ.</li>
              </ul>
            </div>
            <button type="button" className="checkout-btn secondary" onClick={handleSubmit} disabled={loading}>
              {loading ? "Đang xác nhận..." : "Đặt hàng & trả tiền mặt"}
            </button>
          </div>
        )}

        {error && <div className="checkout-error">{error}</div>}
        {message && <div className="checkout-success">{message}</div>}
      </div>
      </div>
    </CustomerLayout>
  );
};

const CheckoutNew = () => (
  <Elements stripe={stripePromise}>
    <CheckoutFormInner />
  </Elements>
);

export default CheckoutNew;
