import React, { useEffect, useMemo, useState, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RESTAURANT_SERVICE_URL, AUTH_SERVICE_URL } from "../../utils/serviceUrls";
import { CartContext } from "../contexts/CartContext";
import { FaRegUserCircle, FaClipboardList, FaShoppingCart, FaSignOutAlt, FaUtensils, FaMapMarkerAlt, FaClock } from "react-icons/fa";
import { getAuthToken, clearAuthToken, AUTH_ROLES } from "../../utils/authTokens";

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
  const totalRestaurants = restaurants.length;

  const lastProfileUpdate = useMemo(() => {
    if (!customer?.updatedAt) return null;
    try {
      return new Date(customer.updatedAt);
    } catch (err) {
      return null;
    }
  }, [customer]);

  const stats = useMemo(
    () => [
      {
        label: "Nhà hàng đối tác",
        value: totalRestaurants,
        icon: <FaMapMarkerAlt size={18} color="#2563eb" />,
      },
      {
        label: "Món trong giỏ",
        value: cartItemCount,
        icon: <FaShoppingCart size={18} color="#16a34a" />,
      },
      {
        label: "Cập nhật hồ sơ",
        value: lastProfileUpdate ? lastProfileUpdate.toLocaleDateString("vi-VN") : "Chưa cập nhật",
        icon: <FaClock size={18} color="#f59e0b" />,
      },
    ],
    [totalRestaurants, cartItemCount, lastProfileUpdate]
  );

  const categories = useMemo(
    () => [
      "Món Việt",
      "Mì & Phở",
      "Cà phê & Trà sữa",
      "Đồ ăn nhanh",
      "Tráng miệng",
      "Ăn sáng nhanh",
    ],
    []
  );

  const filteredRestaurants = restaurants.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLogout = useCallback(() => {
    clearAuthToken(AUTH_ROLES.CUSTOMER);
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

    const token = getAuthToken(AUTH_ROLES.CUSTOMER);
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
      background: "linear-gradient(135deg, rgba(255,239,229,1) 0%, rgba(255,217,189,1) 100%)",
      textColor: "#9a3412",
    },
    {
      title: "Đơn hàng hiện tại",
      description: "Theo dõi tình trạng và chi tiết đơn hàng của bạn.",
      icon: <FaClipboardList size={28} color="#4d96ff" />,
      onClick: () => navigate("/customer/orders"),
      background: "linear-gradient(135deg, rgba(230,240,255,1) 0%, rgba(209,229,255,1) 100%)",
      textColor: "#1d4ed8",
    },
    {
      title: "Giỏ hàng",
      description: cartItemCount > 0
        ? `Bạn có ${cartItemCount} món đang chờ thanh toán.`
        : "Giỏ hàng của bạn đang trống, cùng chọn món nhé!",
      icon: <FaShoppingCart size={28} color="#44c767" />,
      onClick: () => navigate("/customer/cart"),
      background: "linear-gradient(135deg, rgba(232,248,239,1) 0%, rgba(210,241,222,1) 100%)",
      textColor: "#047857",
      badge: cartItemCount,
    },
    {
      title: "Đăng xuất",
      description: "Đăng xuất tài khoản và quay lại trang chủ.",
      icon: <FaSignOutAlt size={28} color="#ff6b6b" />,
      onClick: handleLogout,
      background: "linear-gradient(135deg, rgba(255,236,236,1) 0%, rgba(255,214,214,1) 100%)",
      textColor: "#b91c1c",
    },
  ];

  return (
    <div style={{ padding: "30px", backgroundColor: "#f8f9ff", minHeight: "100vh" }}>
      <div
        style={{
          position: "relative",
          borderRadius: "28px",
          padding: "48px 40px",
          marginBottom: "40px",
          overflow: "hidden",
          background: "linear-gradient(125deg, #ffb36b 0%, #ff5f8f 50%, #6a5bff 100%)",
          color: "#fff",
          boxShadow: "0 25px 55px rgba(88, 81, 219, 0.32)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at top left, rgba(255,255,255,0.25), transparent 45%), radial-gradient(circle at bottom right, rgba(255,255,255,0.18), transparent 40%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "36px",
          }}
        >
          <div style={{ flex: "1 1 320px", minWidth: "260px" }}>
            <p style={{ margin: 0, opacity: 0.85, fontSize: "16px", letterSpacing: "0.5px" }}>
              Chào mừng bạn trở lại
            </p>
            <h1
              style={{
                margin: "14px 0 18px",
                fontSize: "36px",
                lineHeight: 1.2,
                fontWeight: 700,
              }}
            >
              {customer ? `${customer.firstName} ${customer.lastName}` : "Khách hàng thân thiết"} 👋<br />
              Sẵn sàng cho bữa ăn hôm nay?
            </h1>
            <p style={{ margin: "0 0 26px", maxWidth: "520px", fontSize: "17px", lineHeight: 1.6, opacity: 0.9 }}>
              Khám phá thực đơn hấp dẫn, theo dõi đơn hàng và cá nhân hóa trải nghiệm giao đồ ăn của riêng bạn chỉ với vài thao tác.
            </p>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <button
                onClick={() => navigate("/customer/profile")}
                style={{
                  padding: "12px 28px",
                  borderRadius: "999px",
                  border: "none",
                  backgroundColor: "rgba(255,255,255,0.92)",
                  color: "#ff5f8f",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 14px 26px rgba(255,255,255,0.25)",
                }}
              >
                Quản lý thông tin
              </button>
              <button
                onClick={() => {
                  if (cartItemCount > 0) {
                    navigate("/customer/cart");
                  } else if (restaurants[0]) {
                    handleCardClick(restaurants[0]._id);
                  }
                }}
                style={{
                  padding: "12px 24px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.55)",
                  backgroundColor: "transparent",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  backdropFilter: "blur(4px)",
                }}
              >
                Xem giỏ hàng
              </button>
            </div>
          </div>
          <div style={{ flex: "1 1 260px", minWidth: "240px" }}>
            <div
              style={{
                backgroundColor: "rgba(255,255,255,0.18)",
                borderRadius: "22px",
                padding: "22px",
                backdropFilter: "blur(8px)",
                display: "grid",
                gap: "18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "16px",
                    backgroundColor: "rgba(255,255,255,0.22)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FaUtensils size={22} color="#fff" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: "14px", opacity: 0.8 }}>Nhà hàng khả dụng</p>
                  <h3 style={{ margin: "4px 0 0", fontSize: "26px" }}>{totalRestaurants}</h3>
                </div>
              </div>
              <div style={{ display: "grid", gap: "12px" }}>
                {categories.slice(0, 3).map((category) => (
                  <span
                    key={category}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      borderRadius: "999px",
                      backgroundColor: "rgba(255,255,255,0.22)",
                      fontSize: "13px",
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor: "rgba(255,255,255,0.7)",
                      }}
                    />
                    {category}
                  </span>
                ))}
              </div>
            </div>
          </div>
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
              background: action.background,
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
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: action.textColor || "#1f2937" }}>
                {action.title}
              </h3>
            </div>
            <p style={{ margin: 0, color: action.textColor || "#374151", fontSize: "14px", lineHeight: "1.5" }}>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "18px",
          marginBottom: "36px",
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              backgroundColor: "white",
              borderRadius: "18px",
              padding: "18px 22px",
              boxShadow: "0 12px 26px rgba(15,23,42,0.08)",
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                backgroundColor: "rgba(99,102,241,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {stat.icon}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>{stat.label}</p>
              <h4 style={{ margin: "4px 0 0", fontSize: "20px", color: "#0f172a" }}>{stat.value}</h4>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          backgroundColor: "white",
          borderRadius: "22px",
          padding: "26px 30px",
          boxShadow: "0 18px 32px rgba(15,23,42,0.08)",
          marginBottom: "36px",
        }}
      >
        <h3 style={{ margin: "0 0 18px", fontSize: "22px", color: "#1e293b" }}>Khám phá nhanh</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {categories.map((category) => (
            <span
              key={category}
              style={{
                padding: "10px 18px",
                borderRadius: "999px",
                backgroundColor: "rgba(59,130,246,0.12)",
                color: "#1d4ed8",
                fontWeight: 600,
                fontSize: "13px",
              }}
            >
              #{category}
            </span>
          ))}
        </div>
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
          filteredRestaurants.map((rest) => {
            const resolveImage = () => {
              const picture = rest.profilePicture || rest.imageURL;
              if (!picture) {
                return "https://via.placeholder.com/300x200?text=Restaurant+Image";
              }
              if (/^https?:\/\//i.test(picture)) {
                return picture;
              }
              const normalizedPath = picture.startsWith("/")
                ? picture
                : `/${picture}`;
              return `${RESTAURANT_SERVICE_URL}${normalizedPath}`;
            };

            return (
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
                src={resolveImage()}
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
            );
          })
        )}
      </div>
    </div>
  );
}

export default CustomerHome;
