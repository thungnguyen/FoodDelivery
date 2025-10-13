import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { ORDER_SERVICE_URL, RESTAURANT_SERVICE_URL, AUTH_SERVICE_URL } from "../utils/serviceUrls";
import { BsFilePdf } from "react-icons/bs";
import { jsPDF } from "jspdf";
import { ensurePdfFonts } from "../utils/pdfFonts";
import { Button, Spinner, Alert, Badge } from "react-bootstrap";

const formatCurrency = (value) => {
  if (typeof value !== "number") return "0 VND";
  return `${value.toLocaleString("vi-VN")} VND`;
};

const displayFoodNameFromMaps = (item, menuMap) => {
  if (item.foodName) return item.foodName;
  if (item.name) return item.name;
  const key = item.foodId ? String(item.foodId) : item._id ? String(item._id) : "";
  if (key && menuMap[key]) return menuMap[key];
  return key ? 'Món đã xoá' : 'Món ăn';
};

function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [menuMap, setMenuMap] = useState({});
  const [restaurantName, setRestaurantName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOrder = async () => {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");

      if (!token) {
        setError("Bạn cần đăng nhập để xem chi tiết đơn hàng.");
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(`${ORDER_SERVICE_URL}/api/orders/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setOrder(response.data);

        if (!response.data.restaurantName && response.data.restaurantId) {
          try {
            const restaurantResponse = await axios.get(
              `${RESTAURANT_SERVICE_URL}/api/restaurants/${response.data.restaurantId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );
            if (restaurantResponse.data?.name) {
              setRestaurantName(restaurantResponse.data.name);
            }
          } catch (restaurantError) {
            console.error("Could not fetch restaurant info", restaurantError);
          }
        }
      } catch (err) {
        console.error("Error fetching order details:", err);
        setError(err.response?.data?.message || "Không thể tải chi tiết đơn hàng. Vui lòng thử lại sau.");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [id]);

  useEffect(() => {
    const fetchCustomerProfile = async () => {
      if (!order) return;

      if (order.customerName && order.customerName.trim()) {
        setProfileName(order.customerName.trim());
        return;
      }

      const derived = `${order.customerDetails?.firstName || ""} ${order.customerDetails?.lastName || ""}`.trim();
      if (derived) {
        setProfileName(derived);
        return;
      }

      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const customer = response.data?.data?.customer;
        if (customer) {
          const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
          setProfileName(name || customer.email || customer.id || "");
        }
      } catch (profileErr) {
        console.error("Unable to fetch customer profile for details view", profileErr);
      }
    };

    fetchCustomerProfile();
  }, [order]);

  useEffect(() => {
    const loadMenu = async () => {
      if (!order?.restaurantId) return;
      if (!Array.isArray(order.items) || order.items.length === 0) return;

      const restaurantId = String(order.restaurantId);
      const needsLookup = order.items.some((item) => {
        if (item.foodName || item.name) return false;
        const key = item.foodId ? String(item.foodId) : item._id ? String(item._id) : "";
        if (!key) return false;
        return !menuMap[key];
      });

      if (!needsLookup) return;

      try {
        const response = await axios.get(`${RESTAURANT_SERVICE_URL}/api/food-items/restaurant/${restaurantId}`);
        if (Array.isArray(response.data)) {
          const nextMap = {};
          response.data.forEach((food) => {
            if (food?._id) {
              nextMap[String(food._id)] = food.name || food.title || "";
            }
          });
          setMenuMap((prev) => ({ ...prev, ...nextMap }));
        }
      } catch (err) {
        console.error("Unable to fetch menu for details view", err);
      }
    };

    loadMenu();
  }, [order, menuMap]);

  const resolvedRestaurantName = useMemo(() => {
    if (order?.restaurantName) return order.restaurantName;
    if (restaurantName) return restaurantName;
    return order?.restaurantId || "Nhà hàng";
  }, [order, restaurantName]);

  const resolvedCustomerName = useMemo(() => {
    if (profileName && profileName.trim()) return profileName.trim();
    if (order?.customerName && order.customerName.trim()) return order.customerName.trim();
    if (order?.customerDetails) {
      const { firstName = "", lastName = "" } = order.customerDetails;
      const name = `${firstName} ${lastName}`.trim();
      if (name) return name;
    }
    if (order?.customerEmail) return order.customerEmail;
    return order?.customerId || "Khách hàng";
  }, [order, profileName]);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
        <Spinner animation="border" role="status" />
        <span className="ms-3 text-muted">Đang tải chi tiết đơn hàng...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ maxWidth: 720, paddingTop: "60px" }}>
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
        <Button variant="primary" onClick={() => navigate("/customer/orders")}>
          ← Quay lại quản lý đơn hàng
        </Button>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const statusColors = {
    Pending: { backgroundColor: "#ffecb3", color: "#b38f00" },
    Confirmed: { backgroundColor: "#d1f2eb", color: "#1e7e34" },
    Preparing: { backgroundColor: "#d0e2ff", color: "#004085" },
    "Out for Delivery": { backgroundColor: "#ffe3e3", color: "#721c24" },
    Delivered: { backgroundColor: "#e6ffed", color: "#1a7f37" },
    Canceled: { backgroundColor: "#f8d7da", color: "#721c24" }
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    ensurePdfFonts(doc);
    doc.setFont("Roboto", "normal");
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 20;
    let currentY = 40;

    // Title (centered and styled like: ____ ORDER DETAILS ____)
    const title = "__________ ORDER DETAILS __________";
    doc.setFontSize(18);
    doc.setTextColor(0, 0, 139); // Dark blue
    doc.setFont('Roboto', 'bold', 'Identity-H');
    doc.text(title, pageWidth / 2, 20, { align: "center" });

    // Frame layout variables
    const borderTop = 30;
    const borderPadding = 5;
    const startX = marginX - borderPadding;
    let borderHeight = 0;

    // Start yellow background inside content area
    doc.setFillColor(255, 255, 204); // Light yellow
    doc.rect(startX, borderTop, 170, 200, "F"); // temp height, later corrected

    // Customer info - red bold
    doc.setFontSize(14);
    doc.setTextColor(200, 0, 0);
    doc.setFont('Roboto', 'bold', 'Identity-H');
    doc.text(`Khách hàng: ${resolvedCustomerName}`, marginX, currentY);
    currentY += 10;

    // Other fields - normal black
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont('Roboto', 'normal', 'Identity-H');
    doc.text(`Nhà hàng: ${resolvedRestaurantName}`, marginX, currentY);
    currentY += 10;
    doc.text(`Địa chỉ giao: ${order.deliveryAddress}`, marginX, currentY);
    currentY += 10;
    doc.text(`Trạng thái: ${order.status}`, marginX, currentY);
    currentY += 10;

    // Items list
    doc.text("Món ăn:", marginX, currentY);
    currentY += 10;

    order.items.forEach((item) => {
      const resolvedName = displayFoodNameFromMaps(item, menuMap);
      const quantity = item.quantity || 1;
      const unitPrice = formatCurrency(item.price || 0);
      const lineTotal = formatCurrency((item.price || 0) * quantity);

      doc.text(`• ${resolvedName}`, marginX + 5, currentY);
      currentY += 8;
      doc.text(`  Số lượng: ${quantity} × ${unitPrice}`, marginX + 5, currentY);
      currentY += 8;
      doc.text(`  Thành tiền: ${lineTotal}`, marginX + 5, currentY);
      currentY += 10;
    });

    // Total price
    doc.setFontSize(13);
    doc.setTextColor(30, 90, 200);
    doc.setFont('Roboto', 'bold', 'Identity-H');
    doc.text(`Tổng cộng: ${formatCurrency(order.totalPrice || 0)}`, marginX, currentY);
    currentY += 15;

    // Created at
    const createdAt = new Date(order.createdAt).toLocaleString();
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.setFont('Roboto', 'normal', 'Identity-H');
    doc.text(`Ngày tạo: ${createdAt}`, marginX, doc.internal.pageSize.height - 20);

    // Final correct yellow box height
    borderHeight = currentY - borderTop + 10;
    doc.setDrawColor(0);
    doc.setLineWidth(0.8);
    doc.roundedRect(startX, borderTop, 170, borderHeight, 5, 5); // outer border
    doc.setLineWidth(0.2);
    doc.roundedRect(startX + 3, borderTop + 3, 164, borderHeight - 6, 4, 4); // inner border

    doc.save(`Order_${order._id}.pdf`);

    // Show success alert after downloading
    alert("Your order details report downloaded successfully!");
  };

  return (
    <div className="py-5" style={{ backgroundColor: "#f5f7fb", minHeight: "100vh" }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="mb-4 d-flex flex-wrap gap-2">
          <Button variant="light" onClick={() => navigate("/customer/orders")}>
            ← Quay lại quản lý đơn hàng
          </Button>
          <Button variant="outline-danger" onClick={generatePDF} className="d-flex align-items-center gap-2">
            <BsFilePdf size={18} /> Tải PDF
          </Button>
        </div>

        <div className="bg-white rounded-4 shadow-sm border p-4 p-md-5 position-relative overflow-hidden">
          <div
            className="position-absolute top-0 end-0 opacity-25"
            style={{ fontSize: "80px", transform: "rotate(15deg)", marginRight: "-16px", marginTop: "-20px" }}
          >
            🧾
          </div>
          <div className="position-relative" style={{ zIndex: 1 }}>
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-3">
              <h3 className="mb-0">Chi tiết đơn hàng</h3>
              <Badge bg="light" text="dark">
                Mã đơn: {order._id}
              </Badge>
            </div>
            <p className="text-muted mb-4">
              Ngày tạo: {order.createdAt ? new Date(order.createdAt).toLocaleString() : "Không xác định"}
            </p>

            <div className="row g-4">
              <div className="col-md-6">
                <div className="bg-light rounded-3 p-3 h-100">
                  <h6 className="text-uppercase text-muted fw-bold mb-2">Khách hàng</h6>
                  <p className="mb-1 fw-semibold">{resolvedCustomerName}</p>
                  {order.customerEmail && <p className="mb-1 text-muted">Email: {order.customerEmail}</p>}
                  {order.customerPhone && <p className="mb-0 text-muted">SĐT: {order.customerPhone}</p>}
                </div>
              </div>
              <div className="col-md-6">
                <div className="bg-light rounded-3 p-3 h-100">
                  <h6 className="text-uppercase text-muted fw-bold mb-2">Nhà hàng</h6>
                  <p className="mb-1 fw-semibold">{resolvedRestaurantName}</p>

                </div>
              </div>
            </div>

            <div className="bg-light rounded-3 p-3 mt-4">
              <h6 className="text-uppercase text-muted fw-bold mb-2">Địa chỉ giao</h6>
              <p className="mb-0">{order.deliveryAddress}</p>
            </div>

            <div className="d-flex align-items-center gap-3 mt-4">
              <div>
                <span className="text-muted text-uppercase small">Trạng thái thanh toán</span>
                <div className="mt-1">
                  <Badge bg={order.paymentStatus === "Paid" ? "success" : order.paymentStatus === "Failed" ? "danger" : "warning"}>
                    {order.paymentStatus || "Pending"}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted text-uppercase small">Trạng thái đơn</span>
                <div className="mt-1">
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      ...statusColors[order.status] || { backgroundColor: "#e2e8f0", color: "#1e293b" },
                    }}
                  >
                    {order.status || "Pending"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <h5 className="mb-3">Món đã chọn</h5>
              <div className="list-group">
                {order.items.map((item, index) => (
                  <div
                    key={item.foodId || `${order._id}-${index}`}
                    className="list-group-item list-group-item-action d-flex justify-content-between flex-wrap gap-2"
                    style={{ borderRadius: "12px", border: "1px solid rgba(148,163,184,0.25)" }}
                  >
                    <div>
                      <h6 className="mb-1">{displayFoodNameFromMaps(item, menuMap)}</h6>
                      <p className="mb-0 text-muted small">
                        SL: {item.quantity || 1} × {formatCurrency(item.price || 0)}
                      </p>
                    </div>
                    <div className="fw-bold align-self-center">
                      {formatCurrency((item.price || 0) * (item.quantity || 1))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center mt-4">
              <span className="text-muted">Tổng cộng</span>
              <h4 className="mb-0 text-primary">{formatCurrency(order.totalPrice || 0)}</h4>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderDetails;
