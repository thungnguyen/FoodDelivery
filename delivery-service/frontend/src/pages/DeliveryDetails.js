import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "./DeliveryDetails.css";
import { getDriverToken } from "../utils/driverSession";

export default function DeliveryDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDelivery = useCallback(async () => {
    try {
      const token = getDriverToken();
      const res = await axios.get(`http://localhost:5003/api/delivery/${id}`, {
        headers: { Authorization: token }
      });
      setDelivery(res.data.delivery);
    } catch (err) {
      setError(err.response?.data?.message || "Error fetching delivery details");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDelivery();
  }, [fetchDelivery]);

  const handleUpdateStatus = async (newStatus) => {
    try {
      const token = getDriverToken();
      const payload = { status: newStatus };

      if (newStatus === "delivered") {
        const tipInput = window.prompt("Nhập tiền tip (VND) nếu có:", "0");
        const tipAmount = Number(tipInput);
        if (!Number.isNaN(tipAmount) && tipAmount >= 0) {
          payload.tipAmount = tipAmount;
        }
      }

      if (newStatus === "failed") {
        const reason =
          window.prompt("Nhập lý do không giao được đơn:", "") || "";
        if (!reason.trim()) {
          alert("Vui lòng nhập lý do hợp lệ.");
          return;
        }
        payload.failureReason = reason.trim();
      }

      const res = await axios.put(
        `http://localhost:5003/api/delivery/${id}/status`,
        payload,
        { headers: { Authorization: token } }
      );
      alert(res.data.message);
      fetchDelivery();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update status");
    }
  };

  if (loading) return <div className="loading">Loading delivery details...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!delivery) return <div className="loading">No delivery found</div>;

  return (
    <div className="details-container">
      <h2>📦 Delivery Details</h2>

      <div className="details-card">
        <p><strong>Delivery ID:</strong> {delivery._id}</p>
        <p><strong>Order ID:</strong> {delivery.orderId}</p>
        <p><strong>Customer ID:</strong> {delivery.customerId}</p>
        <p><strong>Pickup Address:</strong> {delivery.pickupAddressString}</p>
        <p><strong>Delivery Address:</strong> {delivery.deliveryAddressString}</p>
        <p>
          <strong>Status:</strong>{" "}
          <span className={`status ${delivery.status}`}>{delivery.status}</span>
        </p>
        <p><strong>Created At:</strong> {new Date(delivery.createdAt).toLocaleString()}</p>
      </div>

      <div className="buttons">
        {delivery.status === "assigned" && (
          <button
            className="accept-btn"
            onClick={() => handleUpdateStatus("accepted")}
          >
            📥 Nhận đơn
          </button>
        )}

        {delivery.status === "accepted" && (
          <button
            className="picked-up-btn"
            onClick={() => handleUpdateStatus("picked_up")}
          >
            🚚 Đã lấy món
          </button>
        )}

        {delivery.status === "picked_up" && (
          <button
            className="picked-up-btn"
            onClick={() => handleUpdateStatus("out_for_delivery")}
          >
            🛵 Bắt đầu giao
          </button>
        )}

        {delivery.status === "out_for_delivery" && (
          <>
            <button
              className="delivered-btn"
              onClick={() => handleUpdateStatus("delivered")}
            >
              ✅ Giao thành công
            </button>
            <button
              className="failed-btn"
              onClick={() => handleUpdateStatus("failed")}
            >
              ⚠️ Không giao được
            </button>
          </>
        )}
      </div>

      <div className="buttons">
        <button className="back-btn" onClick={() => navigate("/dashboard")}>
          ⬅️ Back to Dashboard
        </button>
      </div>
    </div>
  );
}
