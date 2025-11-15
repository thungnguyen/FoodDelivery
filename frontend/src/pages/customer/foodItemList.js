import React, { useEffect, useMemo, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FaHome,
  FaMapMarkerAlt,
  FaStar,
  FaPhone,
  FaClock,
  FaUtensils,
} from "react-icons/fa";
import { CartContext } from "../contexts/CartContext";
import {
  RESTAURANT_SERVICE_URL,
  ORDER_SERVICE_URL,
} from "../../utils/serviceUrls";
import CustomerLayout from "../../components/customer/CustomerLayout";
import { getAuthToken, AUTH_ROLES } from "../../utils/authTokens";

const FALLBACK_RESTAURANT_IMAGE =
  "https://placehold.co/800x450?text=Restaurant+Image";
const FALLBACK_FOOD_IMAGE = "https://placehold.co/400x280?text=Food+Image";

const resolveAssetUrl = (raw, fallback) => {
  if (!raw || typeof raw !== "string") {
    return fallback;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
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

function FoodItemList() {
  const { restaurantId } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useContext(CartContext);

  const [foods, setFoods] = useState([]);
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantDetails, setRestaurantDetails] = useState(null);
  const [ratingInfo, setRatingInfo] = useState({
    averageRating: null,
    totalOrders: 0,
  });
  const [ratingError, setRatingError] = useState("");
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState({});
  const availableFoodsCount = useMemo(
    () => foods.filter((item) => item.availability !== false).length,
    [foods]
  );

  useEffect(() => {
    let isMounted = true;

    const fetchRestaurantFoods = async () => {
      try {
        const res = await axios.get(
          `${RESTAURANT_SERVICE_URL}/api/food-items/restaurant/${restaurantId}`
        );
        if (!isMounted) return;
        setFoods(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setError("Không thể tải danh sách món ăn cho nhà hàng này.");
        }
      }
    };

    const fetchRestaurantDetails = async () => {
      try {
        const res = await axios.get(
          `${RESTAURANT_SERVICE_URL}/api/restaurants/${restaurantId}`
        );
        if (!isMounted) return;
        setRestaurantName(res.data?.name || "Nhà hàng");
        setRestaurantDetails(res.data || null);
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setRestaurantName("Nhà hàng");
          setRestaurantDetails(null);
        }
      }
    };

    const fetchRestaurantRating = async () => {
      const token = getAuthToken(AUTH_ROLES.CUSTOMER);
      if (!token) {
        setRatingInfo({ averageRating: null, totalOrders: 0 });
        setRatingError("Đăng nhập để xem đánh giá.");
        return;
      }

      try {
        const res = await axios.get(
          `${ORDER_SERVICE_URL}/api/orders/feedback/restaurant`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { restaurantId },
          }
        );
        if (!isMounted) return;
        const data = res.data || {};
        setRatingInfo({
          averageRating:
            typeof data.averageRating === "number"
              ? Math.round(data.averageRating * 10) / 10
              : null,
          totalOrders:
            Number.isFinite(Number(data.totalOrdersWithFeedback))
              ? Number(data.totalOrdersWithFeedback)
              : Number(data.totalReviews) || 0,
        });
        setRatingError("");
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setRatingInfo({ averageRating: null, totalOrders: 0 });
          setRatingError("Chưa thể tải đánh giá cho nhà hàng này.");
        }
      }
    };

    fetchRestaurantFoods();
    fetchRestaurantDetails();
    fetchRestaurantRating();

    return () => {
      isMounted = false;
    };
  }, [restaurantId]);

  const toggleFavorite = (foodId) => {
    setFavorites((prev) => ({
      ...prev,
      [foodId]: !prev[foodId],
    }));
  };

  const handleAddToCart = (food) => {
    if (restaurantDetails?.availability === false || food.availability === false) {
      alert("Món ăn hiện tạm ngưng phục vụ.");
      return;
    }
    addToCart({
      ...food,
      restaurantName,
      restaurant: food.restaurant || restaurantId,
    });
    navigate("/customer/cart");
  };

  const handleViewDetails = (food) => {
    navigate(`/customer/restaurant/${restaurantId}/foods/${food._id}`, {
      state: {
        food,
        restaurantName,
        foods,
        restaurantAvailability: restaurantDetails?.availability,
      },
    });
  };

  const ratingDisplay = useMemo(() => {
    if (!Number.isFinite(Number(ratingInfo.averageRating))) {
      return null;
    }
    return Number(ratingInfo.averageRating).toFixed(1);
  }, [ratingInfo.averageRating]);

  const restaurantImage = useMemo(() => {
    const source =
      restaurantDetails?.profilePicture || restaurantDetails?.imageURL || "";
    return resolveAssetUrl(source, FALLBACK_RESTAURANT_IMAGE);
  }, [restaurantDetails]);

  const restaurantOpen = restaurantDetails?.availability !== false;
  const statusLabel = restaurantOpen ? "Đang mở cửa" : "Tạm đóng cửa";
  const statusColor = restaurantOpen ? "#16a34a" : "#dc2626";
  const highlightTitle = useMemo(() => {
    if (!restaurantName) {
      return "Nhà hàng yêu thích";
    }
    return restaurantName.toUpperCase();
  }, [restaurantName]);

  return (
    <CustomerLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => navigate("/customer/home")}
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
            <FaHome color="#0f172a" />
          </button>
          <span style={{ color: "#475569", fontWeight: 500 }}>
            Quay lại danh sách nhà hàng
          </span>
        </div>

        <section
          style={{
            background: "linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%)",
            borderRadius: "32px",
            padding: "32px",
            display: "flex",
            flexWrap: "wrap",
            gap: "32px",
            boxShadow: "0 25px 60px rgba(15,23,42,0.15)",
          }}
        >
          <div
            style={{
              flex: "1 1 320px",
              minWidth: "280px",
              borderRadius: "24px",
              overflow: "hidden",
              position: "relative",
              boxShadow: "0 20px 40px rgba(15,23,42,0.25)",
            }}
          >
            <img
              src={restaurantImage}
              alt={restaurantName}
              style={{
                width: "100%",
                height: "100%",
                maxHeight: "320px",
                objectFit: "cover",
                display: "block",
              }}
            />
            <span
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                backgroundColor: `${statusColor}d9`,
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "999px",
                fontWeight: 600,
                fontSize: "13px",
                letterSpacing: "0.02em",
              }}
            >
              {statusLabel}
            </span>
          </div>

          <div style={{ flex: "1 1 400px", minWidth: "320px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                background: "linear-gradient(120deg, #ffecd2 0%, #fcb69f 100%)",
                padding: "18px 22px",
                borderRadius: "24px",
                boxShadow: "0 20px 40px rgba(253,186,116,0.45)",
              }}
            >
              <div
                style={{
                  width: "62px",
                  height: "62px",
                  borderRadius: "18px",
                  backgroundColor: "rgba(255,255,255,0.55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "32px",
                }}
              >
                🍽️
              </div>
              <div>
                <p
                  style={{
                    margin: 0,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    fontSize: "12px",
                    color: "#a16207",
                  }}
                >
                  Nhà hàng nổi bật
                </p>
                <h1
                  style={{
                    margin: "4px 0 0",
                    fontSize: "30px",
                    letterSpacing: "-0.01em",
                    color: "#78350f",
                  }}
                >
                  {highlightTitle}
                </h1>
                <p style={{ margin: "4px 0 0", color: "#92400e", fontSize: "14px" }}>
                  Tận hưởng thực đơn đậm chất riêng cùng dịch vụ tận tâm.
                </p>
              </div>
            </div>

            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#475569",
                fontSize: "16px",
                marginBottom: "12px",
              }}
            >
              <FaMapMarkerAlt color="#f97316" />
              {restaurantDetails?.location || "Địa chỉ đang cập nhật"}
            </p>
            {restaurantDetails?.contactNumber ? (
              <p
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  color: "#475569",
                  fontSize: "15px",
                  marginTop: 0,
                  marginBottom: "18px",
                }}
              >
                <FaPhone color="#16a34a" />
                {restaurantDetails.contactNumber}
              </p>
            ) : null}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
                marginBottom: "20px",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  backgroundColor: "#0f172a",
                  color: "#fff",
                  padding: "8px 16px",
                  borderRadius: "999px",
                  fontSize: "13px",
                  boxShadow: "0 12px 24px rgba(15,23,42,0.4)",
                }}
              >
                <FaUtensils /> {availableFoodsCount} món đang phục vụ
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  backgroundColor: "#fff",
                  color: "#475569",
                  padding: "8px 16px",
                  borderRadius: "999px",
                  fontSize: "13px",
                  boxShadow: "0 12px 24px rgba(15,23,42,0.15)",
                }}
              >
                Chủ nhà hàng {restaurantDetails?.ownerName || "đội ngũ tâm huyết"}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "16px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "18px",
                  padding: "16px",
                  boxShadow: "0 20px 45px rgba(79,70,229,0.12)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                  Điểm trung bình
                </span>
                <span
                  style={{
                    fontSize: "30px",
                    fontWeight: 700,
                    color: "#1e293b",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FaStar color="#facc15" /> {ratingDisplay || "—"}
                </span>
                <span style={{ color: "#64748b", fontSize: "13px" }}>
                  {ratingInfo.totalOrders > 0
                    ? `Dựa trên ${ratingInfo.totalOrders} đơn đã đánh giá`
                    : ratingError || "Chưa có đơn hàng nào được đánh giá"}
                </span>
              </div>

              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "18px",
                  padding: "16px",
                  boxShadow: "0 20px 45px rgba(79,70,229,0.12)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                  Trạng thái
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: "18px",
                    color: statusColor,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <FaClock color={statusColor} />
                  {statusLabel}
                </span>
                <span style={{ color: "#64748b", fontSize: "13px" }}>
                  Cập nhật realtime từ nhà hàng
                </span>
              </div>
            </div>
          </div>
        </section>

        {!restaurantOpen && (
          <div
            style={{
              backgroundColor: "#fef3c7",
              borderRadius: "20px",
              padding: "16px 20px",
              color: "#92400e",
              fontWeight: 600,
              boxShadow: "0 18px 32px rgba(146,64,14,0.15)",
            }}
          >
            Nhà hàng đang tạm đóng cửa. Bạn vẫn có thể xem thực đơn, nhưng việc đặt món sẽ khả dụng
            khi nhà hàng mở lại.
          </div>
        )}

        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "28px",
            padding: "28px 32px 32px",
            boxShadow: "0 18px 55px rgba(15,23,42,0.12)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "26px",
                  color: "#0f172a",
                  letterSpacing: "-0.01em",
                }}
              >
                Món nổi bật tại {restaurantName}
              </h2>
              <p style={{ margin: "8px 0 0", color: "#64748b" }}>
                Chọn món bạn yêu thích và thưởng thức ngay hôm nay.
              </p>
            </div>
          </div>

          {error ? (
            <p style={{ color: "#dc2626", textAlign: "center", fontWeight: 600 }}>
              {error}
            </p>
          ) : null}

          {foods.length === 0 ? (
            <p style={{ textAlign: "center", color: "#475569" }}>
              Nhà hàng chưa có món ăn nào được hiển thị.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "24px",
              }}
            >
              {foods.map((food) => {
                const isFavorite = Boolean(favorites[food._id]);
                const foodAvailable = food.availability !== false;
                const canOrder = restaurantOpen && foodAvailable;
                const itemStatusLabel = !restaurantOpen
                  ? "Nhà hàng tạm đóng"
                  : foodAvailable
                  ? "Đang phục vụ"
                  : "Tạm ngưng";
                const itemStatusColor = foodAvailable
                  ? restaurantOpen
                    ? "#22c55e"
                    : "#f97316"
                  : "#94a3b8";
                return (
                  <div
                    key={food._id}
                    style={{
                      position: "relative",
                      backgroundColor: "#f8fafc",
                      borderRadius: "24px",
                      overflow: "hidden",
                      boxShadow: "0 18px 40px rgba(15,23,42,0.12)",
                      cursor: "pointer",
                      transition: "transform 0.25s ease, box-shadow 0.25s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.boxShadow =
                        "0 25px 60px rgba(15,23,42,0.18)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        "0 18px 40px rgba(15,23,42,0.12)";
                    }}
                    onClick={() => handleViewDetails(food)}
                  >
                    <img
                      src={resolveAssetUrl(food.image, FALLBACK_FOOD_IMAGE)}
                      alt={food.name}
                      style={{
                        width: "100%",
                        height: "180px",
                        objectFit: "cover",
                        display: "block",
                      }}
                      />
                      {!canOrder && (
                        <span
                          style={{
                            position: "absolute",
                            top: "12px",
                            left: "12px",
                            padding: "5px 12px",
                            borderRadius: "999px",
                            backgroundColor: `${itemStatusColor}cc`,
                            color: "#fff",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          {itemStatusLabel}
                        </span>
                      )}
                    <div style={{ padding: "18px 20px 22px" }}>
                      <h3
                        style={{
                          margin: "0 0 8px",
                          fontSize: "18px",
                          color: "#0f172a",
                        }}
                      >
                        {food.name}
                      </h3>
                      <p
                        style={{
                          margin: "0 0 12px",
                          fontSize: "14px",
                          color: "#64748b",
                        }}
                      >
                        {food.description || "Món ăn hấp dẫn đang đợi bạn."}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "18px",
                          fontWeight: 700,
                          color: "#f97316",
                        }}
                      >
                        {formatCurrency(food.price)}
                      </p>
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: "13px",
                          color: "#94a3b8",
                        }}
                      >
                        Phân loại: {food.category || "Đang cập nhật"}
                      </p>
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: itemStatusColor,
                        }}
                      >
                        {itemStatusLabel}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleFavorite(food._id);
                      }}
                      style={{
                        position: "absolute",
                        top: "14px",
                        right: "14px",
                        border: "none",
                        width: "42px",
                        height: "42px",
                        borderRadius: "50%",
                        backgroundColor: "rgba(255,255,255,0.85)",
                        boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
                        fontSize: "20px",
                        cursor: "pointer",
                        transition: "transform 0.2s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                    >
                      {isFavorite ? "❤️" : "🤍"}
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canOrder) {
                          return;
                        }
                        handleAddToCart(food);
                      }}
                      disabled={!canOrder}
                      style={{
                        position: "absolute",
                        bottom: "16px",
                        right: "18px",
                        border: "none",
                        width: "48px",
                        height: "48px",
                        borderRadius: "16px",
                        background: canOrder
                          ? "linear-gradient(135deg, #f97316, #fb923c)"
                          : "#cbd5f5",
                        color: canOrder ? "#fff" : "#475569",
                        fontSize: "26px",
                        fontWeight: 600,
                        boxShadow: canOrder
                          ? "0 20px 35px rgba(249,115,22,0.35)"
                          : "0 6px 18px rgba(148,163,184,0.4)",
                        cursor: canOrder ? "pointer" : "not-allowed",
                      }}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </CustomerLayout>
  );
}

export default FoodItemList;
