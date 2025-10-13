import React, { useEffect, useMemo, useState, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RESTAURANT_SERVICE_URL, AUTH_SERVICE_URL } from "../../utils/serviceUrls";
import { CartContext } from "../contexts/CartContext";
import { FaRegUserCircle, FaClipboardList, FaShoppingCart, FaSignOutAlt } from "react-icons/fa";

function CustomerHome() {
  const [restaurants, setRestaurants] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { cartItems } = useContext(CartContext);

  const cartItemCount = useMemo(
    () => cartItems.reduce((count, item) => count + (item.quantity || 1), 0),
    [cartItems]
  );

  const filteredRestaurants = restaurants.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("pendingOrder");
    navigate("/");
  }, [navigate]);

  useEffect(() => {
    setError("");

    const fetchRestaurants = async () => {
      try {
        const res = await fetch(`${RESTAURANT_SERVICE_URL}/api/restaurants/all`);

        const data = await res.json();
        if (res.ok) {
          setRestaurants(data);
        } else {
          setError(data.message || 'Failed to fetch restaurants');
        }
      } catch (err) {
        setError('Server error while fetching restaurants');
      }
    };

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/auth/login");
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`${AUTH_SERVICE_URL}/api/auth/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          handleLogout();
          return;
        }

        const data = await res.json();
        if (res.ok) {
          setCustomer(data.data.customer);
        } else {
          setError(data.message || "Unable to load profile details");
        }
      } catch (profileErr) {
        setError("Server error while fetching profile information");
      }
    };

    fetchRestaurants();
    fetchData();
  }, [navigate, handleLogout]);

  const handleCardClick = (restaurantId) => {
    navigate(`/customer/restaurant/${restaurantId}/foods`);
  };

  const quickActions = [
    {
      title: "Quản lý thông tin",
      description: "Cập nhật thông tin cá nhân và địa chỉ giao hàng của bạn.",
      icon: <FaRegUserCircle size={28} color="#ff914d" />,
      onClick: () => navigate("/customer/profile"),
      accent: "#fff0e6",
    },
    {
      title: "Đơn hàng hiện tại",
      description: "Theo dõi tình trạng và chi tiết đơn hàng của bạn.",
      icon: <FaClipboardList size={28} color="#4d96ff" />,
      onClick: () => navigate("/customer/orders"),
      accent: "#e6f0ff",
    },
    {
      title: "Giỏ hàng",
      description: cartItemCount > 0
        ? `Bạn có ${cartItemCount} món đang chờ thanh toán.`
        : "Giỏ hàng của bạn đang trống, cùng chọn món nhé!",
      icon: <FaShoppingCart size={28} color="#44c767" />,
      onClick: () => navigate("/customer/cart"),
      accent: "#e8f8ef",
      badge: cartItemCount,
    },
    {
      title: "Đăng xuất",
      description: "Đăng xuất tài khoản và quay lại trang chủ.",
      icon: <FaSignOutAlt size={28} color="#ff6b6b" />,
      onClick: handleLogout,
      accent: "#ffecec",
    },
  ];

  return (
    <div style={{ padding: "30px", backgroundColor: "#f8f9ff", minHeight: "100vh" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #ffecd9 0%, #ffe0f7 100%)",
          borderRadius: "20px",
          padding: "32px",
          marginBottom: "32px",
          boxShadow: "0 18px 40px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <p style={{ margin: 0, color: "#7a7a7a", fontSize: "16px" }}>Chào mừng bạn trở lại,</p>
            <h2
              style={{
                fontSize: "34px",
                fontWeight: "700",
                color: "#ff6b00",
                margin: 0,
                textShadow: "0 12px 24px rgba(255,107,0,0.25)",
              }}
            >
              {customer ? `${customer.firstName} ${customer.lastName}` : "Khách hàng thân thiết"} 👋
            </h2>
          </div>
          <p style={{ margin: 0, maxWidth: "520px", color: "#555", fontSize: "16px", lineHeight: "1.5" }}>
            Hãy khám phá những món ăn hấp dẫn, quản lý đơn hàng của bạn và thưởng thức trải nghiệm giao đồ ăn nhanh chóng cùng chúng tôi.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
          marginBottom: "40px",
        }}
      >
        {quickActions.map((action, index) => (
          <button
            key={action.title}
            onClick={action.onClick}
            style={{
              border: "none",
              borderRadius: "18px",
              padding: "22px",
              textAlign: "left",
              backgroundColor: action.accent,
              cursor: "pointer",
              boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              transition: "transform 0.25s ease, box-shadow 0.25s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-6px)";
              e.currentTarget.style.boxShadow = "0 16px 30px rgba(0,0,0,0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.08)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <span>{action.icon}</span>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#333" }}>
                {action.title}
              </h3>
            </div>
            <p style={{ margin: 0, color: "#555", fontSize: "14px", lineHeight: "1.5" }}>
              {action.description}
            </p>
            {typeof action.badge === "number" && action.badge > 0 && (
              <div
                style={{
                  alignSelf: "flex-start",
                  padding: "4px 12px",
                  borderRadius: "999px",
                  backgroundColor: "#fff",
                  color: "#2f9e44",
                  fontWeight: 600,
                  boxShadow: "0 6px 14px rgba(68,199,103,0.15)",
                }}
              >
                {action.badge} món trong giỏ
              </div>
            )}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h3 style={{ 
          fontSize: "26px", 
          fontWeight: "700", 
          color: "#1f2933",
          margin: 0,
          letterSpacing: "0.5px"
        }}>
          🍽️ Nhà hàng gần bạn
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input
            type="text"
            placeholder="🔍 Tìm quán ăn yêu thích..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "320px",
              maxWidth: "100%",
              padding: "12px 18px",
              fontSize: "15px",
              borderRadius: "12px",
              border: "1px solid rgba(0,0,0,0.08)",
              outline: "none",
              backgroundColor: "#fff",
              boxShadow: "0 6px 16px rgba(15,23,42,0.08)",
              transition: "box-shadow 0.3s ease-in-out",
            }}
            onFocus={(e) => {
              e.target.style.boxShadow = "0 10px 24px rgba(15,23,42,0.12)";
            }}
            onBlur={(e) => {
              e.target.style.boxShadow = "0 6px 16px rgba(15,23,42,0.08)";
            }}
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "24px",
            padding: "16px 20px",
            borderRadius: "12px",
            backgroundColor: "#ffe3e3",
            color: "#b00020",
            fontWeight: 500,
          }}
        >
          {error}
        </div>
      )}

      {/* Restaurant Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "24px",
          padding: "0 20px",
        }}
      >
        {filteredRestaurants.length === 0 ? (
          <p style={{ textAlign: "center", color: "#52606d", fontSize: "18px" }}>
            Không tìm thấy nhà hàng phù hợp. Hãy thử từ khóa khác nhé!
          </p>
        ) : (
          filteredRestaurants.map((rest) => (
            <div
              key={rest._id}
              onClick={() => handleCardClick(rest._id)}
              style={{
                backgroundColor: "white",
                borderRadius: "16px",
                overflow: "hidden",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)", 
                cursor: "pointer",
                transition: "transform 0.3s, box-shadow 0.3s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.03)";
                e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)";
              }}
            >
              <img
                src={rest.imageURL || "https://via.placeholder.com/300x200?text=Restaurant+Image"}
                alt={rest.name}
                style={{
                  width: "100%",
                  height: "180px",
                  objectFit: "cover",
                }}
              />
              <div style={{ padding: "16px" }}>
                <h5 style={{ fontSize: "20px", fontWeight: "bold", color: "#333", marginBottom: "8px" }}>
                  {rest.name}
                </h5>
                <p style={{ margin: "6px 0", fontSize: "14px", color: "#666" }}>
                  📍 <strong style={{ color: "#444" }}>Location:</strong> {rest.location}
                </p>
                <p style={{ margin: "6px 0", fontSize: "14px", color: "#666" }}>
                  📞 <strong style={{ color: "#444" }}>Contact:</strong> {rest.contactNumber}
                </p>
                <p style={{ margin: "6px 0", fontSize: "13px", color: "#888" }}>
                  ⏰ <strong style={{ color: "#555" }}>Cập nhật:</strong> {rest.updatedAt ? new Date(rest.updatedAt).toLocaleDateString() : "Không rõ"}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default CustomerHome;
