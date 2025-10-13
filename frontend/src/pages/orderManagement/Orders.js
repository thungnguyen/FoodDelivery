import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ORDER_SERVICE_URL, RESTAURANT_SERVICE_URL, AUTH_SERVICE_URL } from "../../utils/serviceUrls";
import { Link, useNavigate } from "react-router-dom";
import { Button, Spinner, Badge } from "react-bootstrap";

const formatCurrency = (value) => {
  if (typeof value !== "number") return "0 VND";
  return `${value.toLocaleString("vi-VN")} VND`;
};

function Orders() {
  const [orders, setOrders] = useState([]);
  const [restaurantNames, setRestaurantNames] = useState({});
  const [menuCache, setMenuCache] = useState({});
  const [currentCustomer, setCurrentCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Fetch orders from the backend when the component mounts
  useEffect(() => {
    const fetchOrders = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Please log in to view your orders.");
        setLoading(false);
        return;
      }

      try {
        setError("");
        const response = await axios.get(`${ORDER_SERVICE_URL}/api/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const sorted = Array.isArray(response.data)
          ? [...response.data].sort((a, b) => {
              const timeA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
              const timeB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
              return timeB - timeA;
            })
          : [];
        setOrders(sorted);
      } catch (err) {
        console.error("Error fetching orders:", err);
        setError(err.response?.data?.message || "Unable to load orders. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const fetchProfile = async () => {
      try {
        const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const customer = response.data?.data?.customer;
        if (customer) {
          setCurrentCustomer(customer);
        }
      } catch (err) {
        console.error("Unable to fetch customer profile", err);
      }
    };

    fetchProfile();
  }, []);

  useEffect(() => {
    const missingIds = orders
      .filter(order => !order.restaurantName && order.restaurantId && !restaurantNames[order.restaurantId])
      .map(order => order.restaurantId);

    const uniqueIds = Array.from(new Set(missingIds));
    if (!uniqueIds.length) return;

    const token = localStorage.getItem("token");

    const fetchNames = async () => {
      try {
        const responses = await Promise.allSettled(
          uniqueIds.map(id =>
            axios.get(`${RESTAURANT_SERVICE_URL}/api/restaurants/${id}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            })
          )
        );

        const nextMap = {};
        responses.forEach((result, index) => {
          if (result.status === "fulfilled" && result.value?.data?.name) {
            nextMap[uniqueIds[index]] = result.value.data.name;
          }
        });

        if (Object.keys(nextMap).length) {
          setRestaurantNames(prev => ({ ...prev, ...nextMap }));
        }
      } catch (fetchErr) {
        console.error("Unable to fetch restaurant names", fetchErr);
      }
    };

    fetchNames();
  }, [orders, restaurantNames]);

  useEffect(() => {
    const restaurantsNeedingMenu = orders
      .filter((order) =>
        order.items?.some((item) => {
          if (item.foodName) return false;
          const foodKey = item.foodId ? String(item.foodId) : item._id ? String(item._id) : "";
          if (!foodKey) return false;
          const restaurantKey = order.restaurantId ? String(order.restaurantId) : "";
          return !(menuCache[restaurantKey]?.[foodKey]);
        })
      )
      .map((order) => (order.restaurantId ? String(order.restaurantId) : ""))
      .filter(Boolean);

    const uniqueRestaurantIds = Array.from(new Set(restaurantsNeedingMenu));
    if (!uniqueRestaurantIds.length) return;

    const fetchMenus = async () => {
      try {
        const responses = await Promise.allSettled(
          uniqueRestaurantIds.map(id =>
            axios.get(`${RESTAURANT_SERVICE_URL}/api/food-items/restaurant/${id}`)
          )
        );

        const nextCache = {};
        responses.forEach((result, index) => {
          if (result.status === "fulfilled" && Array.isArray(result.value?.data)) {
            const mapped = {};
            result.value.data.forEach((food) => {
              if (food?._id) {
                const key = String(food._id);
                mapped[key] = food.name || food.title || "";
              }
            });
            const restaurantKey = String(uniqueRestaurantIds[index]);
            nextCache[restaurantKey] = mapped;
          } else if (result.status === "rejected") {
            const restaurantKey = String(uniqueRestaurantIds[index]);
            nextCache[restaurantKey] = {};
          }
        });

        if (Object.keys(nextCache).length) {
          setMenuCache((prev) => ({ ...prev, ...nextCache }));
        }
      } catch (menuErr) {
        console.error("Unable to fetch menu details", menuErr);
      }
    };

    fetchMenus();
  }, [orders, menuCache]);

  // Handle delete order
  const handleDelete = (id) => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please log in to manage your orders.");
      return;
    }

    axios.delete(`${ORDER_SERVICE_URL}/api/orders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(() => {
        setError("");
        setOrders(prevOrders => prevOrders.filter(order => order._id !== id));
      })
      .catch((error) => {
        console.error("Error deleting order:", error);
        setError(error.response?.data?.message || "Failed to delete order.");
      });
  };

  const categorizeOrder = (status = "") => status.trim().toLowerCase();

  const activeOrders = useMemo(
    () =>
      orders.filter((order) => {
        const status = categorizeOrder(order.status);
        return status && !["delivered", "canceled", "cancelled"].includes(status);
      }),
    [orders]
  );

  const historyOrders = useMemo(
    () =>
      orders.filter((order) => {
        const status = categorizeOrder(order.status);
        return ["delivered", "canceled", "cancelled"].includes(status);
      }),
    [orders]
  );

  const displayRestaurantName = (order) => {
    if (order.restaurantName) return order.restaurantName;
    if (order.restaurantDetails?.name) return order.restaurantDetails.name;
    if (order.restaurantId && restaurantNames[order.restaurantId]) {
      return restaurantNames[order.restaurantId];
    }
    return order.restaurantId || "Nhà hàng";
  };

  const displayCustomerName = (order) => {
    if (order.customerName && order.customerName.trim()) {
      return order.customerName.trim();
    }

    const derived = `${order.customerDetails?.firstName || ""} ${order.customerDetails?.lastName || ""}`.trim();
    if (derived) {
      return derived;
    }

    if (currentCustomer && (!order.customerId || order.customerId === currentCustomer.id)) {
      const profileName = `${currentCustomer.firstName || ""} ${currentCustomer.lastName || ""}`.trim();
      if (profileName) {
        return profileName;
      }
      if (currentCustomer.email) {
        return currentCustomer.email;
      }
    }

    return order.customerId || "Khách hàng";
  };

  const displayFoodName = (order, item) => {
    if (item.foodName) return item.foodName;
    if (item.name) return item.name;

    const restaurantKey = order.restaurantId ? String(order.restaurantId) : "";
    const foodKey = item.foodId ? String(item.foodId) : item._id ? String(item._id) : "";
    if (restaurantKey && foodKey && menuCache[restaurantKey]?.[foodKey]) {
      return menuCache[restaurantKey][foodKey];
    }

    return foodKey ? 'Món đã xoá' : 'Món ăn';
  };

  const [selectedTab, setSelectedTab] = useState("active");

  const renderOrderList = (list, emptyMessage) => {
    if (!list.length) {
      return (
        <div className="text-center py-5 text-muted">
          {emptyMessage}
        </div>
      );
    }

    return list.map((order) => {
      const formattedDate = order.createdAt ? new Date(order.createdAt).toLocaleString() : "Không xác định";
      const statusLabel = order.status || "Pending";
      const paymentLabel = order.paymentStatus || "Pending";
      const badgeVariant =
        paymentLabel === "Paid" ? "success" : paymentLabel === "Failed" ? "danger" : "warning";

      return (
        <div key={order._id} className="bg-white rounded-3 shadow-sm p-4 mb-4 border border-light">
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3">
            <div>
              <h5 className="mb-1">Đơn hàng ngày {formattedDate}</h5>
              <p className="mb-1 text-secondary">Khách hàng: {displayCustomerName(order)}</p>
              <p className="mb-1 text-secondary">Nhà hàng: {displayRestaurantName(order)}</p>
              <p className="mb-1 text-secondary">Địa chỉ giao: {order.deliveryAddress}</p>
            </div>
            <div className="text-md-end">
              <Badge bg={badgeVariant} className="me-2">{paymentLabel}</Badge>
              <Badge bg="info">{statusLabel}</Badge>
            </div>
          </div>

          <div className="mt-3">
            {order.items.map((item, index) => (
              <div
                key={`${order._id}-${index}`}
                className="d-flex justify-content-between align-items-center py-2 border-bottom"
              >
                <div>
                  <strong>{displayFoodName(order, item)}</strong>
                  <div className="text-muted small">
                    SL: {item.quantity || 1} × {formatCurrency(item.price || 0)}
                  </div>
                </div>
                <div className="fw-semibold">
                  {formatCurrency((item.price || 0) * (item.quantity || 1))}
                </div>
              </div>
            ))}
          </div>

          <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mt-3 gap-3">
            <div className="fw-bold fs-5">Tổng cộng: {formatCurrency(order.totalPrice || 0)}</div>
            <div className="d-flex gap-2">
              <Link to={`/orders/details/${order._id}`}>
                <Button variant="primary" size="sm">
                  Xem chi tiết đơn
                </Button>
              </Link>
            {categorizeOrder(order.status) !== "delivered" && (
              <Button variant="outline-danger" size="sm" onClick={() => handleDelete(order._id)}>
                Hủy đơn
              </Button>
            )}
            </div>
          </div>
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="container text-center my-5">
        <Spinner animation="border" role="status" />
        <p className="mt-3">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <div
        className="rounded-4 p-4 p-md-5 mb-4 text-white position-relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #ec4899 45%, #f97316 100%)",
          boxShadow: "0 25px 40px rgba(79,70,229,0.2)",
        }}
      >
        <div className="position-absolute top-0 end-0 opacity-50 pe-4 pt-4" style={{ fontSize: "64px" }}>
          🛵
        </div>
        <div className="position-relative" style={{ zIndex: 1 }}>
          <Button variant="light" size="sm" onClick={() => navigate("/customer/home")} className="mb-3">
            ← Về trang chính
          </Button>
          <h1 className="fw-bold mb-3">Theo dõi đơn hàng của bạn</h1>
          <p className="mb-0" style={{ maxWidth: 540 }}>
            Chủ động kiểm soát đơn hàng đang xử lý và xem lại lịch sử những bữa ăn gần đây của bạn. Nhấn “Xem chi tiết” để
            mở thông tin đầy đủ của từng đơn.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-4 p-4 p-md-5 shadow-sm border mb-4">
        <div className="row g-3 text-center text-md-start">
          <div className="col-12 col-md-4">
            <div className="p-3 rounded-3 bg-primary bg-opacity-10 h-100">
              <p className="text-muted mb-1">Tổng số đơn</p>
              <h3 className="fw-bold mb-0">{orders.length}</h3>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="p-3 rounded-3 bg-success bg-opacity-10 h-100">
              <p className="text-muted mb-1">Đang xử lý</p>
              <h3 className="fw-bold text-success mb-0">{activeOrders.length}</h3>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="p-3 rounded-3 bg-secondary bg-opacity-10 h-100">
              <p className="text-muted mb-1">Lịch sử</p>
              <h3 className="fw-bold text-secondary mb-0">{historyOrders.length}</h3>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="bg-white rounded-4 shadow-sm border p-3 mb-4">
        <div className="d-flex gap-3 flex-wrap">
          <button
            onClick={() => setSelectedTab("active")}
            className={`btn ${selectedTab === "active" ? "btn-primary" : "btn-outline-secondary"} rounded-pill px-4`}
          >
            Đơn hàng đang xử lý <span className="badge bg-light text-dark ms-2">{activeOrders.length}</span>
          </button>
          <button
            onClick={() => setSelectedTab("history")}
            className={`btn ${selectedTab === "history" ? "btn-primary" : "btn-outline-secondary"} rounded-pill px-4`}
          >
            Lịch sử đơn hàng <span className="badge bg-light text-dark ms-2">{historyOrders.length}</span>
          </button>
        </div>
      </div>

      <div className="bg-light bg-opacity-50 rounded-4 p-3 p-md-4">
        {selectedTab === "active"
          ? renderOrderList(activeOrders, "Bạn chưa có đơn hàng nào đang xử lý.")
          : renderOrderList(historyOrders, "Chưa có đơn hàng hoàn thành. Đặt món để trải nghiệm ngay nhé!")}
      </div>
    </div>
  );
}

export default Orders;
