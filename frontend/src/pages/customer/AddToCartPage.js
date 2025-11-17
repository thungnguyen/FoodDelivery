import React, { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaShoppingBag, FaStar, FaClock } from "react-icons/fa";
import { CartContext } from "../contexts/CartContext";
import CustomerLayout from "../../components/customer/CustomerLayout";
import { RESTAURANT_SERVICE_URL } from "../../utils/serviceUrls";

const FALLBACK_FOOD_IMAGE = "https://placehold.co/400x260?text=Food+Image";

const resolveImage = (raw) => {
  if (!raw || typeof raw !== "string") {
    return FALLBACK_FOOD_IMAGE;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return FALLBACK_FOOD_IMAGE;
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${RESTAURANT_SERVICE_URL}${normalized}`;
};

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${numeric.toLocaleString("vi-VN")} ₫`;
  }
};

function AddToCartPage() {
  const { cartItems, removeFromCart, updateQuantity, changeQuantityBy } =
    useContext(CartContext);
  const navigate = useNavigate();

  const handleProceed = () => {
    navigate("/orders/new");
  };

  const handleBackToFoodList = () => {
    navigate("/customer/home");
  };

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (total, item) => total + (item.price || 0) * (item.quantity || 1),
        0
      ),
    [cartItems]
  );

  const cartQuantity = useMemo(
    () => cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0),
    [cartItems]
  );

  const restaurantsInCart = useMemo(() => {
    const unique = new Set();
    cartItems.forEach((item) => {
      const key =
        item.restaurant || item.restaurantId || item.restaurantName || item._id;
      unique.add(String(key || "unknown"));
    });
    return unique.size;
  }, [cartItems]);

  return (
    <CustomerLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={handleBackToFoodList}
            type="button"
            style={{
              border: "none",
              background: "#fff",
              borderRadius: "12px",
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
              cursor: "pointer",
            }}
          >
            <FaArrowLeft color="#0f172a" />
          </button>
          <span style={{ color: "#475569", fontWeight: 500 }}>
            Tiếp tục chọn món
          </span>
        </div>

        <section
          style={{
            borderRadius: "32px",
            padding: "28px 32px",
            background: "linear-gradient(135deg, #e0e7ff 0%, #fdf2f8 100%)",
            boxShadow: "0 25px 60px rgba(15,23,42,0.15)",
            display: "flex",
            flexWrap: "wrap",
            gap: "28px",
            alignItems: "center",
          }}
        >
          <div style={{ flex: "1 1 360px", minWidth: "280px" }}>
            <p
              style={{
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.3em",
                fontSize: "12px",
                color: "#6366f1",
              }}
            >
              Giỏ hàng của bạn
            </p>
            <h1
              style={{
                fontSize: "34px",
                margin: "10px 0 12px",
                color: "#0f172a",
                letterSpacing: "-0.01em",
              }}
            >
              Sẵn sàng thưởng thức {cartQuantity || 0} món ngon
            </h1>
            <p style={{ margin: 0, color: "#475569", fontSize: "16px" }}>
              Kiểm tra lại các món yêu thích trước khi đặt hàng. Bạn có thể điều
              chỉnh số lượng hoặc tiếp tục thêm món từ các nhà hàng khác nhau.
            </p>
          </div>
          <div
            style={{
              flex: "1 1 240px",
              minWidth: "220px",
              display: "flex",
              gap: "16px",
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            {[
              {
                label: "Tổng đơn",
                value: formatCurrency(cartTotal),
                icon: <FaShoppingBag color="#0f172a" />,
              },
              {
                label: "Điểm ưu thích",
                value: cartItems.length,
                icon: <FaStar color="#0f172a" />,
              },
            ].map(({ label, value, icon }) => (
              <div
                key={label}
                style={{
                  flex: "1 1 140px",
                  minWidth: "140px",
                  backgroundColor: "#fff",
                  borderRadius: "20px",
                  padding: "16px",
                  boxShadow: "0 18px 35px rgba(15,23,42,0.15)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "38px",
                    height: "38px",
                    borderRadius: "12px",
                    backgroundColor: "#e0e7ff",
                    marginBottom: "10px",
                  }}
                >
                  {icon}
                </span>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                  {label}
                </p>
                <p
                  style={{
                    margin: "6px 0 0",
                    color: "#0f172a",
                    fontSize: "18px",
                    fontWeight: 700,
                  }}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {cartItems.length === 0 ? (
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "24px",
              padding: "48px 32px",
              textAlign: "center",
              boxShadow: "0 20px 50px rgba(15,23,42,0.12)",
              color: "#475569",
            }}
          >
            <h3 style={{ fontSize: "24px", marginBottom: "12px", color: "#0f172a" }}>
              Giỏ hàng đang trống
            </h3>
            <p style={{ fontSize: "16px", marginBottom: "24px" }}>
              Hãy chọn món yêu thích để đội ngũ tài xế chuẩn bị giao đến bạn nhé! 🍜
            </p>
            <button
              type="button"
              onClick={handleBackToFoodList}
              style={{
                border: "none",
                padding: "12px 24px",
                borderRadius: "14px",
                background:
                  "linear-gradient(135deg, #f97316 0%, #fb7185 100%)",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 18px 35px rgba(249,115,22,0.35)",
              }}
            >
              Khám phá nhà hàng
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "28px",
            }}
          >
            <div
              style={{
                flex: "1 1 580px",
                minWidth: "320px",
                backgroundColor: "#f8fafc",
                borderRadius: "26px",
                padding: "28px",
                boxShadow: "0 18px 55px rgba(15,23,42,0.1)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "20px",
                }}
              >
                {cartItems.map((item) => {
                  const quantity = item.quantity || 1;
                  const itemTotal = (item.price || 0) * quantity;
                  return (
                    <div
                      key={item._id || item.name}
                      style={{
                        backgroundColor: "#fff",
                        borderRadius: "22px",
                        overflow: "hidden",
                        position: "relative",
                        boxShadow: "0 16px 40px rgba(15,23,42,0.1)",
                        display: "flex",
                        flexDirection: "column",
                        minHeight: "360px",
                      }}
                    >
                      <img
                        src={resolveImage(item.image)}
                        alt={item.name}
                        style={{
                          width: "100%",
                          height: "170px",
                          objectFit: "cover",
                        }}
                      />
                      <div style={{ padding: "18px 20px", flex: 1 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "13px",
                            textTransform: "uppercase",
                            letterSpacing: "0.18em",
                            color: "#94a3b8",
                          }}
                        >
                          {item.restaurantName || "Nhà hàng"}
                        </p>
                        <h3
                          style={{
                            margin: "10px 0 8px",
                            fontSize: "20px",
                            color: "#0f172a",
                          }}
                        >
                          {item.name}
                        </h3>
                        <p
                          style={{
                            margin: 0,
                            color: "#64748b",
                            fontSize: "14px",
                            minHeight: "38px",
                          }}
                        >
                          {item.description || "Món ăn hấp dẫn từ nhà hàng của bạn."}
                        </p>
                        <p
                          style={{
                            margin: "12px 0 4px",
                            fontSize: "15px",
                            color: "#475569",
                          }}
                        >
                          {quantity} × {formatCurrency(item.price || 0)}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "20px",
                            fontWeight: 700,
                            color: "#f97316",
                          }}
                        >
                          {formatCurrency(itemTotal)}
                        </p>
                        <div
                          style={{
                            marginTop: "12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => changeQuantityBy(item._id, -1)}
                            disabled={quantity <= 1}
                            style={{
                              width: "38px",
                              height: "38px",
                              borderRadius: "50%",
                              border: "none",
                              backgroundColor: quantity <= 1 ? "#e2e8f0" : "#e0e7ff",
                              color: "#0f172a",
                              fontWeight: 700,
                              cursor: quantity <= 1 ? "not-allowed" : "pointer",
                              boxShadow: "inset 0 2px 4px rgba(15,23,42,0.12)",
                            }}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => {
                              const next = Math.max(1, Number(e.target.value) || 1);
                              updateQuantity(item._id, next);
                            }}
                            style={{
                              width: "64px",
                              textAlign: "center",
                              padding: "8px",
                              borderRadius: "12px",
                              border: "1px solid #cbd5f5",
                              fontWeight: 600,
                              color: "#0f172a",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => changeQuantityBy(item._id, 1)}
                            style={{
                              width: "38px",
                              height: "38px",
                              borderRadius: "50%",
                              border: "none",
                              backgroundColor: "#e0e7ff",
                              color: "#0f172a",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "inset 0 2px 4px rgba(15,23,42,0.12)",
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Xóa khỏi giỏ"
                        onClick={() => removeFromCart(item._id)}
                        style={{
                          position: "absolute",
                          top: "14px",
                          right: "14px",
                          width: "38px",
                          height: "38px",
                          borderRadius: "50%",
                          border: "none",
                          backgroundColor: "rgba(255,255,255,0.92)",
                          color: "#ef4444",
                          fontSize: "20px",
                          cursor: "pointer",
                          boxShadow: "0 12px 25px rgba(15,23,42,0.18)",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <aside
              style={{
                flex: "0 0 320px",
                minWidth: "280px",
                backgroundColor: "#0f172a",
                color: "#e2e8f0",
                borderRadius: "28px",
                padding: "28px",
                boxShadow: "0 30px 60px rgba(15,23,42,0.5)",
              }}
            >
              <p style={{ margin: 0, letterSpacing: "0.25em", fontSize: "12px", opacity: 0.8 }}>
                Tổng quan đơn
              </p>
              <h2 style={{ margin: "8px 0 20px", fontSize: "26px", color: "#fff" }}>
                {formatCurrency(cartTotal)}
              </h2>

              <div style={{ display: "grid", gap: "14px", marginBottom: "18px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "15px",
                    color: "#cbd5f5",
                  }}
                >
                  <span>Tổng tạm tính</span>
                  <span>{formatCurrency(cartTotal)}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "15px",
                    color: "#cbd5f5",
                  }}
                >
                  <span>Phí giao hàng</span>
                  <span>Đang ước tính</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "15px",
                    color: "#cbd5f5",
                  }}
                >
                  <span>Số lượng</span>
                  <span>{cartQuantity} món</span>
                </div>
              </div>

              <div
                style={{
                  borderTop: "1px solid rgba(148,163,184,0.3)",
                  paddingTop: "18px",
                  marginBottom: "20px",
                }}
              >
                <p style={{ margin: 0, color: "#cbd5f5" }}>Ghi chú:</p>
                <p style={{ margin: "6px 0 0", color: "#e2e8f0", fontSize: "14px" }}>
                  Thực hiện thanh toán ở bước tiếp theo. Chúng tôi sẽ thông báo thời gian giao dự kiến.
                </p>
              </div>

              <button
                type="button"
                onClick={handleProceed}
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: "18px",
                  padding: "14px 0",
                  background: "linear-gradient(135deg, #f97316, #fb7185)",
                  color: "#fff",
                  fontSize: "16px",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 25px 40px rgba(249,115,22,0.35)",
                  marginBottom: "12px",
                }}
              >
                Tiếp tục đặt hàng
              </button>

              <button
                type="button"
                onClick={handleBackToFoodList}
                style={{
                  width: "100%",
                  border: "1px solid rgba(226,232,240,0.4)",
                  borderRadius: "18px",
                  padding: "12px 0",
                  background: "transparent",
                  color: "#cbd5f5",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Chọn thêm món
              </button>

              <p style={{ marginTop: "16px", fontSize: "13px", color: "#cbd5f5" }}>
                Thanh toán an toàn, hỗ trợ 24/7 và hoàn tiền nếu có sự cố với đơn hàng.
              </p>
            </aside>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}

export default AddToCartPage;
