import React, { useContext, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { FaArrowLeft, FaStar, FaShoppingCart } from "react-icons/fa";
import { RESTAURANT_SERVICE_URL, ORDER_SERVICE_URL } from "../../utils/serviceUrls";
import CustomerLayout from "../../components/customer/CustomerLayout";
import { getAuthToken, AUTH_ROLES } from "../../utils/authTokens";
import { CartContext } from "../contexts/CartContext";

const FALLBACK_IMAGE = "https://placehold.co/600x400?text=Food+Image";

const resolveImage = (raw) => {
  if (!raw || typeof raw !== "string") {
    return FALLBACK_IMAGE;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return FALLBACK_IMAGE;
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${RESTAURANT_SERVICE_URL}${normalizedPath}`;
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
  } catch (error) {
    return `${numeric.toLocaleString("vi-VN")} ₫`;
  }
};

const formatDateTime = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("vi-VN", { hour12: false });
};

const FoodDetailPage = () => {
  const { restaurantId, foodId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const locationFood = location.state?.food || null;
  const locationFoods = Array.isArray(location.state?.foods)
    ? location.state.foods
    : null;
  const locationRestaurantName =
    location.state?.restaurantName || location.state?.food?.restaurant?.name || "";
  const locationRestaurantAvailability =
    typeof location.state?.restaurantAvailability === "boolean"
      ? location.state.restaurantAvailability
      : null;
  const { addToCart } = useContext(CartContext);

  const [food, setFood] = useState(locationFood);
  const [restaurantName, setRestaurantName] = useState(locationRestaurantName);
  const [allFoods, setAllFoods] = useState(locationFoods || []);
  const [loadingFood, setLoadingFood] = useState(!locationFood);
  const [foodError, setFoodError] = useState("");

  const [recommendations, setRecommendations] = useState([]);

  const [reviews, setReviews] = useState([]);
  const [averageRating, setAverageRating] = useState(null);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");
  const [restaurantAvailability, setRestaurantAvailability] = useState(
    locationRestaurantAvailability
  );

  useEffect(() => {
    if (locationFood) {
      setFood(locationFood);
      setLoadingFood(false);
    }
    if (locationFoods) {
      setAllFoods(locationFoods);
    }
    if (locationRestaurantName) {
      setRestaurantName(locationRestaurantName);
    }
    if (typeof locationRestaurantAvailability === "boolean") {
      setRestaurantAvailability(locationRestaurantAvailability);
    }
  }, [locationFood, locationFoods, locationRestaurantName, locationRestaurantAvailability]);

  useEffect(() => {
    let canceled = false;

    const fetchFoods = async () => {
      setLoadingFood(true);
      setFoodError("");

      try {
        const response = await axios.get(
          `${RESTAURANT_SERVICE_URL}/api/food-items/restaurant/${restaurantId}`
        );
        if (canceled) {
          return;
        }
        const items = Array.isArray(response.data) ? response.data : [];
        setAllFoods(items);
        const firstRestaurant = items[0]?.restaurant;
        if (firstRestaurant && typeof firstRestaurant.availability !== "undefined") {
          setRestaurantAvailability(firstRestaurant.availability !== false);
        }

        const selected = items.find((item) => item._id === foodId) || null;
        if (!selected) {
          setFood(null);
          setFoodError("Không tìm thấy thông tin món ăn đã chọn.");
        } else {
          setFood(selected);
          setRestaurantName((prev) => prev || selected?.restaurant?.name || "");
          if (typeof selected?.restaurant?.availability !== "undefined") {
            setRestaurantAvailability(selected.restaurant.availability !== false);
          }
        }
      } catch (error) {
        if (!canceled) {
          console.error("Failed to fetch food items:", error);
          setFoodError("Không thể tải thông tin món ăn.");
        }
      } finally {
        if (!canceled) {
          setLoadingFood(false);
        }
      }
    };

    fetchFoods();

    return () => {
      canceled = true;
    };
  }, [restaurantId, foodId]);

  useEffect(() => {
    let canceled = false;

    const fetchRestaurantInfo = async () => {
      try {
        const response = await axios.get(`${RESTAURANT_SERVICE_URL}/api/restaurants/${restaurantId}`);
        if (canceled) {
          return;
        }
        setRestaurantAvailability(response.data?.availability !== false);
      } catch (error) {
        if (!canceled) {
          console.error("Failed to fetch restaurant metadata:", error);
        }
      }
    };

    fetchRestaurantInfo();

    return () => {
      canceled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!food) {
      setRecommendations([]);
      return;
    }

    const availableItems = allFoods.filter(
      (item) => item._id !== food._id && item.availability !== false
    );

    const sameCategory = food.category
      ? availableItems.filter((item) => item.category === food.category)
      : [];

    const source = sameCategory.length ? sameCategory : availableItems;
    setRecommendations(source.slice(0, 4));
  }, [allFoods, food]);

  useEffect(() => {
    let canceled = false;

    const token = getAuthToken(AUTH_ROLES.CUSTOMER);
    if (!token) {
      setReviews([]);
      setAverageRating(null);
      setReviewsError("Vui lòng đăng nhập để xem đánh giá món ăn.");
      setReviewsLoading(false);
      return;
    }

    const fetchReviews = async () => {
      setReviewsLoading(true);
      setReviewsError("");
      try {
        const response = await axios.get(
          `${ORDER_SERVICE_URL}/api/orders/feedback/restaurant`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { restaurantId, foodId },
          }
        );
        if (canceled) {
          return;
        }
        const data = response.data || {};
        const rawReviews = Array.isArray(data.reviews) ? data.reviews : [];
        const filteredReviews = rawReviews.filter((review) => {
          if (!review?.foodId) {
            return false;
          }
          return String(review.foodId) === String(foodId);
        });

        setReviews(filteredReviews);
        if (
          typeof data.averageRating === "number" &&
          String(data.foodId || foodId) === String(foodId)
        ) {
          setAverageRating(
            filteredReviews.length ? data.averageRating : null
          );
        } else {
          const total = filteredReviews.reduce((sum, review) => {
            const numericRating = Number(review?.rating);
            return Number.isFinite(numericRating) ? sum + numericRating : sum;
          }, 0);
          setAverageRating(
            filteredReviews.length
              ? Math.round((total / filteredReviews.length) * 10) / 10
              : null
          );
        }
      } catch (error) {
        if (!canceled) {
          console.error("Failed to fetch food reviews:", error);
          const apiMessage = error?.response?.data?.message;
          setReviewsError(apiMessage || "Không thể tải đánh giá món ăn.");
          setReviews([]);
          setAverageRating(null);
        }
      } finally {
        if (!canceled) {
          setReviewsLoading(false);
        }
      }
    };

    fetchReviews();

    return () => {
      canceled = true;
    };
  }, [restaurantId, foodId]);

  const ratingText = useMemo(() => {
    if (!Number.isFinite(Number(averageRating))) {
      return null;
    }
    return Number(averageRating).toFixed(1);
  }, [averageRating]);

  const isFoodAvailable = food?.availability !== false;
  const restaurantOpen = restaurantAvailability !== false;
  const canOrderCurrentFood = Boolean(food) && isFoodAvailable && restaurantOpen;
  const detailStatusLabel = !restaurantOpen
    ? "Nhà hàng tạm đóng"
    : isFoodAvailable
    ? "Đang mở bán"
    : "Tạm ngưng bán";
  const detailStatusColor = !restaurantOpen
    ? "#ea580c"
    : isFoodAvailable
    ? "#22c55e"
    : "#94a3b8";

  const handleBack = () => {
    navigate(-1);
  };

  const handleAddToCartFromDetail = () => {
    if (!food || !canOrderCurrentFood) {
      return;
    }
    addToCart({
      ...food,
      restaurantName: restaurantName || food.restaurant?.name,
      restaurant: food.restaurant || restaurantId,
    });
    navigate("/customer/cart");
  };

  const handleRecommendationClick = (item) => {
    navigate(`/customer/restaurant/${restaurantId}/foods/${item._id}`, {
      state: {
        food: item,
        restaurantName: restaurantName || item?.restaurant?.name,
        foods: allFoods,
        restaurantAvailability,
      },
    });
  };

  return (
    <CustomerLayout>
      <div
        style={{
          padding: "32px",
          background: "linear-gradient(180deg, #f5f7fb 0%, #e9edf5 100%)",
          minHeight: "100vh",
        }}
      >
      <button
        type="button"
        onClick={handleBack}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "24px",
          padding: "10px 18px",
          borderRadius: "999px",
          border: "none",
          backgroundColor: "#ffffff",
          boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
          cursor: "pointer",
          fontWeight: 600,
          color: "#1f2937",
        }}
      >
        <FaArrowLeft size={16} />
        Trở lại
      </button>

      {loadingFood ? (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "32px",
            boxShadow: "0 12px 32px rgba(15,23,42,0.08)",
            fontSize: "18px",
            fontWeight: 500,
            color: "#334155",
          }}
        >
          Đang tải thông tin món ăn...
        </div>
      ) : foodError ? (
        <div
          style={{
            backgroundColor: "#fff1f2",
            borderRadius: "16px",
            padding: "28px",
            boxShadow: "0 12px 32px rgba(190,18,60,0.12)",
            fontSize: "18px",
            fontWeight: 500,
            color: "#9f1239",
          }}
        >
          {foodError}
        </div>
      ) : !food ? (
        <div
          style={{
            backgroundColor: "#fff1f2",
            borderRadius: "16px",
            padding: "28px",
            boxShadow: "0 12px 32px rgba(190,18,60,0.12)",
            fontSize: "18px",
            fontWeight: 500,
            color: "#9f1239",
          }}
        >
          Không tìm thấy món ăn.
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "32px",
            backgroundColor: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 16px 38px rgba(15,23,42,0.08)",
            padding: "32px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              flex: "1 1 360px",
              minWidth: "280px",
              borderRadius: "16px",
              overflow: "hidden",
              boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
            }}
          >
            <img
              src={resolveImage(food.image)}
              alt={food.name}
              style={{
                width: "100%",
                height: "100%",
                maxHeight: "420px",
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>

          <div
            style={{
              flex: "1 1 360px",
              minWidth: "280px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: "32px",
                  fontWeight: 800,
                  color: "#1f2937",
                  marginBottom: "12px",
                }}
              >
                {food.name}
              </h1>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  color: "#f59e0b",
                  fontSize: "18px",
                  fontWeight: 600,
                }}
              >
                <FaStar />
                {ratingText ? (
                  <>
                    <span>{ratingText}</span>
                    <span style={{ color: "#64748b", fontWeight: 500 }}>
                      ({reviews.length} đánh giá)
                    </span>
                  </>
                ) : (
                  <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                    Chưa có đánh giá
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                fontSize: "30px",
                fontWeight: 700,
                color: "#dc2626",
              }}
            >
              {formatCurrency(food.price)}
            </div>

            <p
              style={{
                color: "#334155",
                fontSize: "16px",
                lineHeight: 1.7,
              }}
            >
              {food.description}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "16px",
              }}
            >
              <div style={{ color: "#475569" }}>
                <strong style={{ display: "block", color: "#1f2937" }}>
                  Nhà hàng
                </strong>
                {restaurantName || "—"}
              </div>
              <div style={{ color: "#475569" }}>
                <strong style={{ display: "block", color: "#1f2937" }}>
                  Danh mục
                </strong>
                {food.category || "—"}
              </div>
              <div style={{ color: "#475569" }}>
                <strong style={{ display: "block", color: "#1f2937" }}>
                  Trạng thái
                </strong>
                {food.availability === false ? "Tạm ngưng bán" : "Đang mở bán"}
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddToCartFromDetail}
              style={{
                marginTop: "12px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "14px 24px",
                borderRadius: "12px",
                border: "none",
                background:
                  "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
                color: "#ffffff",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 12px 24px rgba(249,115,22,0.35)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = "translateY(-2px)";
                event.currentTarget.style.boxShadow =
                  "0 16px 32px rgba(249,115,22,0.4)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = "translateY(0)";
                event.currentTarget.style.boxShadow =
                  "0 12px 24px rgba(249,115,22,0.35)";
              }}
            >
              <FaShoppingCart size={18} />
              Thêm vào giỏ
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
          padding: "32px",
          marginBottom: "32px",
        }}
      >
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "#1f2937",
            marginBottom: "20px",
          }}
        >
          Đánh giá từ khách hàng
        </h2>

        {reviewsLoading ? (
          <p style={{ color: "#475569", fontSize: "16px" }}>
            Đang tải đánh giá...
          </p>
        ) : reviewsError ? (
          <p style={{ color: "#b91c1c", fontSize: "16px", fontWeight: 500 }}>
            {reviewsError}
          </p>
        ) : reviews.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "16px" }}>
            Chưa có đánh giá nào cho món ăn này. Hãy là người đầu tiên chia sẻ
            trải nghiệm!
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {reviews.map((review, index) => {
              const ratingValue = Number(review?.rating);
              const displayRating = Number.isFinite(ratingValue)
                ? ratingValue.toFixed(1)
                : "—";
              return (
                <div
                  key={`${review.orderId || index}-${index}`}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "14px",
                    padding: "20px",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "16px",
                          color: "#1f2937",
                        }}
                      >
                        {review.customerName || "Khách hàng"}
                      </div>
                      <div style={{ color: "#64748b", fontSize: "14px" }}>
                        {formatDateTime(review.ratedAt)}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        backgroundColor: "#fff7ed",
                        color: "#c2410c",
                        padding: "6px 12px",
                        borderRadius: "999px",
                        fontWeight: 600,
                      }}
                    >
                      <FaStar />
                      <span>{displayRating}</span>
                    </div>
                  </div>
                  {review.comment && (
                    <p
                      style={{
                        marginTop: "14px",
                        color: "#334155",
                        lineHeight: 1.6,
                        fontSize: "15px",
                      }}
                    >
                      {review.comment}
                    </p>
                  )}
                  <div
                    style={{
                      marginTop: "14px",
                      color: "#475569",
                      fontSize: "14px",
                    }}
                  >
                    Số lượng: x{Number(review.quantity) || 1} • Giá món:{" "}
                    {formatCurrency(review.itemPrice)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
          padding: "32px",
        }}
      >
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "#1f2937",
            marginBottom: "20px",
          }}
        >
          Gợi ý món ngon khác
        </h2>

        {recommendations.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "16px" }}>
            Nhà hàng sẽ sớm cập nhật thêm món mới cho bạn lựa chọn.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "20px",
            }}
          >
            {recommendations.map((item) => (
              <div
                key={item._id}
                onClick={() => handleRecommendationClick(item)}
                style={{
                  cursor: "pointer",
                  borderRadius: "16px",
                  overflow: "hidden",
                  boxShadow: "0 12px 28px rgba(15,23,42,0.08)",
                  backgroundColor: "#ffffff",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  display: "flex",
                  flexDirection: "column",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.transform = "translateY(-4px)";
                  event.currentTarget.style.boxShadow =
                    "0 16px 36px rgba(15,23,42,0.12)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = "translateY(0)";
                  event.currentTarget.style.boxShadow =
                    "0 12px 28px rgba(15,23,42,0.08)";
                }}
              >
                <img
                  src={resolveImage(item.image)}
                  alt={item.name}
                  style={{
                    width: "100%",
                    height: "180px",
                    objectFit: "cover",
                  }}
                />
                <div style={{ padding: "16px" }}>
                  <h3
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "#1f2937",
                      marginBottom: "8px",
                    }}
                  >
                    {item.name}
                  </h3>
                  <div
                    style={{
                      color: "#dc2626",
                      fontWeight: 600,
                      fontSize: "16px",
                    }}
                  >
                    {formatCurrency(item.price)}
                  </div>
                  <p
                    style={{
                      marginTop: "8px",
                      color: "#64748b",
                      fontSize: "14px",
                      minHeight: "42px",
                    }}
                  >
                    {item.description?.slice(0, 90) || "Món ngon đáng thử."}
                    {item.description && item.description.length > 90 ? "..." : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </CustomerLayout>
  );
};

export default FoodDetailPage;
