import React, { useEffect, useMemo, useState, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RESTAURANT_SERVICE_URL, AUTH_SERVICE_URL } from "../../utils/serviceUrls";
import CustomerLayout from "../../components/customer/CustomerLayout";
import { CartContext } from "../contexts/CartContext";
import {
  FaRegUserCircle,
  FaClipboardList,
  FaShoppingCart,
  FaSignOutAlt,
  FaUtensils,
  FaMapMarkerAlt,
  FaClock,
  FaCompass,
  FaBolt,
  FaLeaf,
  FaHeart,
  FaGift,
} from "react-icons/fa";
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

  const customerDisplayName = useMemo(() => {
    if (!customer) {
      return "Khách hàng thân thiết";
    }
    if (customer.firstName || customer.lastName) {
      const full = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
      if (full) {
        return full;
      }
    }
    return customer.fullName || customer.name || customer.email || "Khách hàng thân thiết";
  }, [customer]);

  const heroSpotlight = filteredRestaurants[0] || restaurants[0] || null;

  const quickActions = useMemo(
    () => [
      {
        title: "Hồ sơ & ưu đãi",
        description: customer
          ? `Email: ${customer.email || "Chưa cập nhật"}`
          : "Cập nhật thông tin cá nhân và địa chỉ giao hàng.",
        icon: <FaRegUserCircle size={26} color="#0f172a" />,
        onClick: () => navigate("/customer/profile"),
        accent: "#fef3c7",
        textColor: "#92400e",
      },
      {
        title: "Theo dõi đơn",
        description: "Kiểm tra tiến độ và lịch sử các đơn đã đặt.",
        icon: <FaClipboardList size={24} color="#1d4ed8" />,
        onClick: () => navigate("/customer/orders"),
        accent: "#dbeafe",
        textColor: "#1e3a8a",
      },
      {
        title: "Giỏ hàng",
        description:
          cartItemCount > 0
            ? `Bạn có ${cartItemCount} món sẵn sàng thanh toán.`
            : "Giỏ hàng của bạn đang trống, hãy thêm món nhé!",
        icon: <FaShoppingCart size={24} color="#065f46" />,
        onClick: () => navigate("/customer/cart"),
        accent: "#d1fae5",
        textColor: "#065f46",
        badge: cartItemCount,
      },
      {
        title: "Đăng xuất",
        description: "Thoát tài khoản và quay lại trang chủ.",
        icon: <FaSignOutAlt size={24} color="#b91c1c" />,
        onClick: handleLogout,
        accent: "#fee2e2",
        textColor: "#991b1b",
      },
    ],
    [cartItemCount, customer, handleLogout, navigate]
  );

  const curatedCollections = useMemo(
    () => [
      {
        title: "Giao nhanh 20'",
        description: "Món nóng hổi, ưu tiên giao trong khu vực của bạn.",
        accentIcon: <FaBolt size={18} color="#ffedd5" />,
        gradient: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
        query: "nhanh",
      },
      {
        title: "Healthy Living",
        description: "Salad, nước ép và những lựa chọn tốt cho sức khỏe.",
        accentIcon: <FaLeaf size={18} color="#dcfce7" />,
        gradient: "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
        query: "healthy",
      },
      {
        title: "Cafe & Trà sữa",
        description: "Thức uống yêu thích để làm việc hiệu quả cả ngày.",
        accentIcon: <FaHeart size={18} color="#ffe4e6" />,
        gradient: "linear-gradient(135deg, #ec4899 0%, #fb7185 100%)",
        query: "cafe",
      },
      {
        title: "Ưu đãi hôm nay",
        description: "Bắt trọn deal ngon và các combo dành riêng cho bạn.",
        accentIcon: <FaGift size={18} color="#fef3c7" />,
        gradient: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
        query: "",
      },
    ],
    [setSearchQuery]
  );

  const resolveRestaurantImage = (restaurant) => {
    if (!restaurant) {
      return "https://via.placeholder.com/640x360?text=FoodieFlow";
    }
    const picture = restaurant.profilePicture || restaurant.imageURL;
    if (!picture) {
      return "https://via.placeholder.com/640x360?text=FoodieFlow";
    }
    if (/^https?:\/\//i.test(picture)) {
      return picture;
    }
    const normalizedPath = picture.startsWith("/") ? picture : `/${picture}`;
    return `${RESTAURANT_SERVICE_URL}${normalizedPath}`;
  };

  return (
    <CustomerLayout customerName={customerDisplayName}>
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        <section
          style={{
            position: "relative",
            borderRadius: "36px",
            padding: "40px",
            background:
              "linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #7c3aed 100%)",
            color: "#fff",
            overflow: "hidden",
            boxShadow: "0 40px 90px rgba(15,23,42,0.45)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.25), transparent 40%), radial-gradient(circle at 80% 0%, rgba(99,102,241,0.35), transparent 45%)",
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexWrap: "wrap",
              gap: "32px",
            }}
          >
            <div style={{ flex: "1 1 360px", minWidth: "260px" }}>
              <p style={{ margin: 0, opacity: 0.8, letterSpacing: "0.08em" }}>
                Hành trình ẩm thực của bạn
              </p>
              <h1
                style={{
                  margin: "12px 0 18px",
                  fontSize: "38px",
                  lineHeight: 1.2,
                  fontWeight: 700,
                }}
              >
                Xin chào {customerDisplayName}! 🍽️
              </h1>
              <p
                style={{
                  margin: "0 0 24px",
                  maxWidth: "520px",
                  fontSize: "17px",
                  lineHeight: 1.7,
                  opacity: 0.92,
                }}
              >
                Chọn món yêu thích, theo dõi đơn realtime và nhận ưu đãi dành riêng cho bạn mỗi ngày.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
                <button
                  type="button"
                  onClick={() => {
                    if (heroSpotlight && heroSpotlight._id) {
                      handleCardClick(heroSpotlight._id);
                    } else if (filteredRestaurants[0]) {
                      handleCardClick(filteredRestaurants[0]._id);
                    }
                  }}
                  style={{
                    padding: "14px 28px",
                    borderRadius: "999px",
                    border: "none",
                    backgroundColor: "#fbbf24",
                    color: "#0f172a",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 18px 30px rgba(251,191,36,0.35)",
                  }}
                >
                  Khám phá quán mới
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/customer/orders")}
                  style={{
                    padding: "14px 26px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.6)",
                    backgroundColor: "transparent",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                    backdropFilter: "blur(6px)",
                  }}
                >
                  Đơn hàng của tôi
                </button>
              </div>
              <div style={{ marginTop: "28px" }}>
                <label
                  htmlFor="customer-home-search"
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "14px",
                    opacity: 0.85,
                  }}
                >
                  🔍 Tìm kiếm món ăn / nhà hàng
                </label>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  <input
                    id="customer-home-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nhập tên quán hoặc món ăn yêu thích..."
                    style={{
                      flex: "1 1 260px",
                      minWidth: "220px",
                      padding: "12px 18px",
                      borderRadius: "16px",
                      border: "none",
                      fontSize: "15px",
                      color: "#0f172a",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    disabled={!searchQuery}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "14px",
                      border: "none",
                      backgroundColor: searchQuery ? "rgba(15,23,42,0.2)" : "rgba(255,255,255,0.2)",
                      color: "#fff",
                      cursor: searchQuery ? "pointer" : "not-allowed",
                      opacity: searchQuery ? 1 : 0.6,
                    }}
                  >
                    Xóa lọc
                  </button>
                </div>
              </div>
            </div>
            <div style={{ flex: "1 1 260px", minWidth: "240px" }}>
              <div
                style={{
                  backgroundColor: "rgba(15,23,42,0.45)",
                  borderRadius: "26px",
                  padding: "24px",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 20px 40px rgba(15,23,42,0.4)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "16px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    color: "#c7d2fe",
                  }}
                >
                  <FaCompass size={18} />
                  <span>Gợi ý quanh bạn</span>
                </div>
                {heroSpotlight ? (
                  <>
                    <div
                      style={{
                        borderRadius: "18px",
                        overflow: "hidden",
                        marginBottom: "16px",
                      }}
                    >
                      <img
                        src={resolveRestaurantImage(heroSpotlight)}
                        alt={heroSpotlight.name}
                        style={{ width: "100%", height: "180px", objectFit: "cover" }}
                      />
                    </div>
                    <h3 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700 }}>
                      {heroSpotlight.name}
                    </h3>
                    <p style={{ margin: "0 0 14px", color: "#e2e8f0" }}>
                      {heroSpotlight.location || "Đang cập nhật địa chỉ"}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCardClick(heroSpotlight._id)}
                      style={{
                        width: "100%",
                        border: "none",
                        borderRadius: "14px",
                        padding: "12px 18px",
                        backgroundColor: "#fef3c7",
                        color: "#78350f",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Xem menu hôm nay
                    </button>
                  </>
                ) : (
                  <p style={{ color: "#e2e8f0", margin: 0 }}>
                    Chúng tôi đang cập nhật thêm nhà hàng tại khu vực của bạn. Vui lòng thử lại sau nhé!
                  </p>
                )}
              </div>
            </div>
          </div>
          <div
            style={{
              position: "relative",
              zIndex: 1,
              marginTop: "32px",
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSearchQuery(category)}
                style={{
                  border: "1px solid rgba(255,255,255,0.35)",
                  borderRadius: "999px",
                  padding: "6px 18px",
                  backgroundColor: "rgba(15,23,42,0.3)",
                  color: "#f8fafc",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                #{category}
              </button>
            ))}
          </div>
        </section>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "18px",
          }}
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                backgroundColor: "#fff",
                borderRadius: "24px",
                padding: "20px",
                boxShadow: "0 16px 30px rgba(15,23,42,0.08)",
                display: "flex",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <div
                style={{
                  width: "54px",
                  height: "54px",
                  borderRadius: "18px",
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
                <h4 style={{ margin: "4px 0 0", fontSize: "22px", color: "#0f172a" }}>{stat.value}</h4>
              </div>
            </div>
          ))}
        </section>
        <section
          style={{
            backgroundColor: "#fff",
            borderRadius: "28px",
            padding: "28px",
            boxShadow: "0 24px 50px rgba(15,23,42,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "24px", color: "#0f172a" }}>Quản lý nhanh</h3>
              <p style={{ margin: "6px 0 0", color: "#475569", fontSize: "14px" }}>
                Cập nhật và truy cập các tính năng bạn dùng thường xuyên.
              </p>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "18px",
            }}
          >
            {quickActions.map((action) => (
              <button
                key={action.title}
                type="button"
                onClick={action.onClick}
                style={{
                  border: "none",
                  borderRadius: "22px",
                  padding: "22px",
                  textAlign: "left",
                  backgroundColor: action.accent,
                  color: action.textColor,
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.4)",
                  cursor: "pointer",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = "translateY(-4px)";
                  event.currentTarget.style.boxShadow = "0 16px 30px rgba(15,23,42,0.12)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = "translateY(0)";
                  event.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.4)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                  <span
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "14px",
                      backgroundColor: "rgba(255,255,255,0.6)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {action.icon}
                  </span>
                  <h4 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>{action.title}</h4>
                </div>
                <p style={{ margin: 0, fontSize: "14px", color: "#334155" }}>{action.description}</p>
                {typeof action.badge === "number" && action.badge > 0 ? (
                  <span
                    style={{
                      display: "inline-flex",
                      marginTop: "12px",
                      padding: "4px 12px",
                      borderRadius: "999px",
                      backgroundColor: "#fff",
                      color: "#047857",
                      fontWeight: 600,
                      fontSize: "13px",
                    }}
                  >
                    {action.badge} món trong giỏ
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "20px",
          }}
        >
          {curatedCollections.map((collection) => (
            <button
              key={collection.title}
              type="button"
              onClick={() => setSearchQuery(collection.query)}
              style={{
                border: "none",
                borderRadius: "26px",
                padding: "24px",
                color: "#fff",
                textAlign: "left",
                background: collection.gradient,
                boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  width: "46px",
                  height: "46px",
                  borderRadius: "16px",
                  backgroundColor: "rgba(0,0,0,0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "14px",
                }}
              >
                {collection.accentIcon}
              </span>
              <h4 style={{ margin: "0 0 10px", fontSize: "20px" }}>{collection.title}</h4>
              <p style={{ margin: "0 0 16px", fontSize: "14px", opacity: 0.9 }}>{collection.description}</p>
              <span style={{ fontWeight: 600 }}>Chọn món ngay -></span>
            </button>
          ))}
        </section>
        {error ? (
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "16px",
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        ) : null}
        <section
          style={{
            backgroundColor: "#fff",
            borderRadius: "32px",
            padding: "32px",
            boxShadow: "0 32px 60px rgba(15,23,42,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "26px", color: "#0f172a" }}>Nhà hàng nổi bật</h3>
              <p style={{ margin: "6px 0 0", color: "#475569", fontSize: "14px" }}>
                Hiển thị {filteredRestaurants.length} / {restaurants.length || 0} nhà hàng phù hợp.
              </p>
            </div>
            <div style={{ fontSize: "14px", color: "#475569" }}>
              {searchQuery ? `Đang lọc theo: "${searchQuery}"` : "Chưa áp dụng bộ lọc tìm kiếm."}
            </div>
          </div>
          {filteredRestaurants.length === 0 ? (
            <p style={{ textAlign: "center", color: "#64748b", fontSize: "16px" }}>
              Không tìm thấy nhà hàng phù hợp. Hãy thử từ khóa khác nhé!
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "24px",
              }}
            >
              {filteredRestaurants.map((rest, index) => {
                const lastUpdated = rest.updatedAt
                  ? new Date(rest.updatedAt).toLocaleDateString("vi-VN")
                  : "Mới cập nhật";
                return (
                  <div
                    key={rest._id}
                    onClick={() => handleCardClick(rest._id)}
                    style={{
                      borderRadius: "26px",
                      overflow: "hidden",
                      border: "1px solid rgba(15,23,42,0.06)",
                      backgroundColor: "#f8fafc",
                      boxShadow: "0 18px 32px rgba(15,23,42,0.08)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease",
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.transform = "translateY(-6px)";
                      event.currentTarget.style.boxShadow = "0 26px 40px rgba(15,23,42,0.16)";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.transform = "translateY(0)";
                      event.currentTarget.style.boxShadow = "0 18px 32px rgba(15,23,42,0.08)";
                    }}
                  >
                    <div style={{ position: "relative", height: "200px" }}>
                      <img
                        src={resolveRestaurantImage(rest)}
                        alt={rest.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      {index < 2 && (
                        <span
                          style={{
                            position: "absolute",
                            top: "14px",
                            left: "14px",
                            padding: "6px 12px",
                            borderRadius: "999px",
                            backgroundColor: "#f59e0b",
                            color: "#fff",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          Đề xuất hôm nay
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        flex: 1,
                      }}
                    >
                      <div>
                        <h4 style={{ margin: "0 0 4px", fontSize: "20px", color: "#0f172a" }}>{rest.name}</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px", color: "#475569" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <FaMapMarkerAlt size={13} color="#f97316" />
                            {rest.location || "Đang cập nhật"}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <FaRegUserCircle size={13} color="#0ea5e9" />
                            {rest.contactNumber || "Liên hệ sau"}
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "10px",
                          fontSize: "13px",
                          color: "#475569",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <FaClock size={12} color="#475569" />
                          {lastUpdated}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCardClick(rest._id);
                          }}
                          style={{
                            border: "none",
                            borderRadius: "12px",
                            padding: "10px 16px",
                            backgroundColor: "#1d4ed8",
                            color: "#fff",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Xem thực đơn
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </CustomerLayout>
  );}

export default CustomerHome;

