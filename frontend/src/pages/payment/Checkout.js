import React, { useState, useEffect, useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardNumberElement, CardExpiryElement, CardCvcElement } from "@stripe/react-stripe-js";
import axios from "axios";
import "../../styles/checkout.css";
import { PAYMENT_SERVICE_URL } from "../../utils/serviceUrls";

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const PAYMENT_METHODS = [
  { key: "card", label: "Thẻ quốc tế / Visa / Master" },
  { key: "vietqr", label: "Chuyển khoản ngân hàng (VietQR)" },
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
    name: "ACB - Ngân hàng Á Châu",
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

const CheckoutForm = () => {
  const stripe = useStripe();
  const elements = useElements();
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [cardType, setCardType] = useState("");
  const [disablePayment, setDisablePayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [selectedBank, setSelectedBank] = useState(BANKS[0]);
  const [copyStatus, setCopyStatus] = useState("");

  const API_BASE_URL = PAYMENT_SERVICE_URL;

  // Example order data – real app should fetch from Order Service.
  const orderData = {
    orderId: "ORDER00036",
    userId: "USER67890",
    amount: 430000, // VND
    currency: "vnd",
    firstName: "Nguyen",
    lastName: "Van A",
    email: "customer@example.com",
    phone: "+84901234567",
  };

  useEffect(() => {
    if (paymentMethod === "card" && !clientSecret && !disablePayment) {
      createPaymentIntent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, clientSecret, disablePayment]);

  const createPaymentIntent = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/payment/process`, orderData);
      console.log("Response from payment API:", response.data);

      if (response.data.paymentStatus === "Paid" || response.data.disablePayment) {
        setMessage("✅ This order has already been paid successfully.");
        setDisablePayment(true);
        return;
      }

      if (response.data.clientSecret) {
        setClientSecret(response.data.clientSecret);
      } else {
        setError("⚠️ No valid payment secret found.");
      }
    } catch (err) {
      console.error("Error creating PaymentIntent", err.response?.data || err.message);
      setError("❌ Failed to create payment. Please try again.");
    }
  };

  const handleCardChange = (event) => {
    if (event.error) {
      setError(event.error.message);
    } else {
      setError(null);
    }
    if (event.brand) {
      setCardType(event.brand);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements || !clientSecret) {
      setError("⚠️ Payment secret is missing.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage("");

    const cardElement = elements.getElement(CardNumberElement);
    const { error, paymentMethod } = await stripe.createPaymentMethod({
      type: "card",
      card: cardElement,
      billing_details: {
        name: `${orderData.firstName} ${orderData.lastName}`,
        email: orderData.email,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    console.log("Using Client Secret:", clientSecret);
    if (!clientSecret.includes("_secret_")) {
      setError("⚠️ Invalid payment secret format.");
      setLoading(false);
      return;
    }

    try {
      const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: paymentMethod.id,
      });

      if (confirmError) {
        setError(confirmError.message);
      } else if (paymentIntent.status === "succeeded") {
        setMessage("✅ Payment Successful!");
        setDisablePayment(true);
      } else {
        setError("❌ Payment failed. Please try again.");
      }
    } catch (err) {
      setError("❌ An unexpected error occurred. Please try again.");
    }
    setLoading(false);
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value || 0);

  const vietQrUrl = useMemo(() => {
    const addInfo = encodeURIComponent(orderData.orderId || "SKYDISH");
    return `https://img.vietqr.io/image/${selectedBank.shortName}-${selectedBank.accountNumber}-compact2.png?amount=${orderData.amount}&addInfo=${addInfo}`;
  }, [selectedBank, orderData.amount, orderData.orderId]);

  const handleCopy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(value);
      setTimeout(() => setCopyStatus(""), 2000);
    } catch (err) {
      console.error("Không thể sao chép", err);
    }
  };

  const handleConfirmTransfer = () => {
    setMessage("✅ Cảm ơn bạn! Đơn hàng sẽ được xác nhận ngay khi tiền tới tài khoản.");
    setError(null);
  };

  return (
    <div className="checkout-container">
      <h2 className="checkout-title">Thanh toán đơn hàng</h2>
      <div className="summary-box">
        <div>
          <p className="summary-label">Mã đơn:</p>
          <strong>{orderData.orderId}</strong>
        </div>
        <div>
          <p className="summary-label">Tổng tiền:</p>
          <strong>{formatCurrency(orderData.amount)}</strong>
        </div>
      </div>

      <div className="payment-method-tabs">
        {PAYMENT_METHODS.map((method) => (
          <button
            key={method.key}
            type="button"
            className={`payment-method-btn ${paymentMethod === method.key ? "active" : ""}`}
            onClick={() => setPaymentMethod(method.key)}
          >
            {method.label}
          </button>
        ))}
      </div>

      {paymentMethod === "card" ? (
        <form onSubmit={handleSubmit} className="checkout-form">
          <div className="input-group">
            <label>Số thẻ</label>
            <CardNumberElement className="stripe-input" onChange={handleCardChange} />
            {cardType && <span className={`card-icon ${cardType}`}></span>}
          </div>
          <div className="input-row">
            <div className="input-group">
              <label>Expiry</label>
              <CardExpiryElement className="stripe-input" onChange={handleCardChange} />
            </div>
            <div className="input-group">
              <label>CVC</label>
              <CardCvcElement className="stripe-input" onChange={handleCardChange} />
            </div>
          </div>
          <button type="submit" disabled={!stripe || loading || disablePayment} className="checkout-btn">
            {loading ? <span className="spinner"></span> : "Thanh toán"}
          </button>
        </form>
      ) : (
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
            <img src={vietQrUrl} alt={`QR ${selectedBank.name}`} className="qr-image" />
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
                  <strong>{orderData.orderId}</strong>
                  <button type="button" className="copy-btn" onClick={() => handleCopy(orderData.orderId)}>
                    Sao chép
                  </button>
                  {copyStatus === orderData.orderId && <span className="copy-done">Đã sao chép</span>}
                </div>
              </div>
            </div>
          </div>

          <ul className="vietqr-note">
            <li>Số tiền: <strong>{formatCurrency(orderData.amount)}</strong></li>
            <li>Sử dụng ứng dụng ngân hàng quét QR để tránh sai sót.</li>
            <li>Vui lòng giữ nguyên nội dung chuyển khoản là mã đơn hàng.</li>
          </ul>

          <button type="button" className="checkout-btn secondary" onClick={handleConfirmTransfer}>
            Tôi đã chuyển khoản
          </button>
        </div>
      )}

      {error && <div className="checkout-error">{error}</div>}
      {message && <div className="checkout-success">{message}</div>}
    </div>
  );
};

const Checkout = () => {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm />
    </Elements>
  );
};

export default Checkout;
