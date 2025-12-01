import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import axios from "axios";
import "../styles/driver-dashboard.css";
import {
  getDriverToken,
  getDriverId,
  clearDriverSession,
  getStoredDriverProfile,
} from "../utils/driverSession";

const DELIVERY_API_BASE =
  process.env.REACT_APP_DELIVERY_API_URL || "http://26.32.188.49:5003/api";

const SOCKET_URL = process.env.REACT_APP_DELIVERY_SOCKET_URL || "http://26.32.188.49:5003";

const socket = io(SOCKET_URL, {
  autoConnect: false,
});

const STATUS_LABELS = {
  assigned: "Chờ chấp nhận",
  accepted: "Đã nhận đơn",
  picked_up: "Đã lấy món",
  out_for_delivery: "Đang giao",
  delivered: "Đã giao",
  failed: "Thất bại",
  cancelled: "Đã hủy",
  awaiting_driver: "Chờ tài xế",
};

const STATUS_ACTIONS = [
  {
    from: ["assigned"],
    to: "accepted",
    label: "Nhận đơn",
    color: "primary",
  },
  {
    from: ["accepted"],
    to: "picked_up",
    label: "Đã lấy món",
    color: "primary",
  },
  {
    from: ["picked_up"],
    to: "out_for_delivery",
    label: "Bắt đầu giao",
    color: "primary",
  },
  {
    from: ["out_for_delivery"],
    to: "delivered",
    label: "Giao thành công",
    color: "success",
  },
  {
    from: ["out_for_delivery"],
    to: "failed",
    label: "Không giao được",
    color: "danger",
  },
];

const TERMINAL_STATUSES = new Set(["delivered", "failed", "cancelled"]);

const formatCurrency = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("vi-VN") : "—";

const categorizeDeliveries = (deliveries) => {
  const active = [];
  const history = [];

  deliveries.forEach((delivery) => {
    if (TERMINAL_STATUSES.has(delivery.status)) {
      history.push(delivery);
    } else {
      active.push(delivery);
    }
  });

  return { active, history };
};

const formatOrderCode = (value) => {
  if (!value) return "------";
  const str = value.toString();
  return str.slice(-6).toUpperCase();
};

const formatPhoneNumber = (value) => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return value;
};

const getStatusLabel = (status) => {
  if (!status) return "Chờ tài xế";
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  return STATUS_LABELS[normalized] || status;
};

export default function DriverDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [availableJobs, setAvailableJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [profile, setProfile] = useState(getStoredDriverProfile());
  const socketLabel = useMemo(
    () => SOCKET_URL.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    []
  );

  const token = getDriverToken();
  const driverId = getDriverId();

  const groupedDeliveries = useMemo(
    () => categorizeDeliveries(deliveries),
    [deliveries]
  );

  const authHeaders = useMemo(
    () => ({
      Authorization: token,
    }),
    [token]
  );

  const handleLogout = useCallback(() => {
    clearDriverSession();
    socket.disconnect();
    navigate("/login");
  }, [navigate]);

  const fetchDashboardData = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const response = await axios.get(`${DELIVERY_API_BASE}/delivery`, {
        headers: authHeaders,
      });

      if (response.data?.success) {
        setDeliveries(response.data.deliveries || []);
        setStats(response.data.stats || null);
      } else {
        setError(response.data?.message || "Không thể tải dữ liệu giao hàng");
      }
    } catch (err) {
      console.error("Failed to fetch deliveries", err);
      setError(err.response?.data?.message || "Lỗi khi tải dữ liệu giao hàng");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, token]);

  const fetchAvailableJobs = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(
        `${DELIVERY_API_BASE}/delivery/available`,
        {
          headers: authHeaders,
        }
      );
      if (response.data?.success) {
        setAvailableJobs(response.data.deliveries || []);
      }
    } catch (err) {
      console.error("Failed to fetch available jobs", err);
    }
  }, [authHeaders, token]);

  const fetchDriverProfile = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(
        `${DELIVERY_API_BASE}/auth/profile`,
        {
          headers: authHeaders,
        }
      );
      if (response.data?.success) {
        setProfile(response.data.data);
      }
    } catch (err) {
      console.warn("Unable to fetch driver profile", err.message);
    }
  }, [authHeaders, token]);

  const syncDashboard = useCallback(async () => {
    setSyncing(true);
    await Promise.all([
      fetchDashboardData(),
      fetchAvailableJobs(),
      fetchDriverProfile(),
    ]);
    setSyncing(false);
  }, [fetchAvailableJobs, fetchDashboardData, fetchDriverProfile]);

  useEffect(() => {
    if (!token) {
      handleLogout();
      return;
    }

    syncDashboard();
  }, [handleLogout, syncDashboard, token]);

  useEffect(() => {
    if (!token || !driverId) {
      return;
    }

    socket.auth = { token };
    socket.connect();
    socket.emit("join-driver-room", driverId);

    const onNewDelivery = (payload) => {
      setAvailableJobs((prev) => {
        const exists = prev.some(
          (item) => item.orderId === payload.orderId || item.id === payload.id
        );
        return exists ? prev : [payload, ...prev];
      });
    };

    socket.on("new-delivery", onNewDelivery);

    return () => {
      socket.off("new-delivery", onNewDelivery);
    };
  }, [token, driverId]);

  const handleAcceptJob = async (job) => {
    try {
      setSyncing(true);
      const payload = {
        orderId: job.orderId,
        customerId: job.customerId,
        customerName: job.customerName,
        customerPhone: job.customerPhone,
        restaurantId: job.restaurantId,
        restaurantName: job.restaurantName,
        pickupAddress: job.restaurantLocation,
        deliveryAddress: job.deliveryAddress,
        orderTotal: job.totalPrice,
        estimatedPayout: job.estimatedPayout,
      };

      const response = await axios.post(
        `${DELIVERY_API_BASE}/delivery/create`,
        payload,
        {
          headers: authHeaders,
        }
      );

      if (response.data?.success) {
        setAvailableJobs((prev) =>
          prev.filter((item) => item.orderId !== job.orderId)
        );
        await fetchDashboardData();
      } else {
        alert(response.data?.message || "Không thể nhận đơn");
      }
    } catch (err) {
      console.error("Accept job error", err);
      alert(err.response?.data?.message || "Không thể nhận đơn này");
    } finally {
      setSyncing(false);
    }
  };

  const handleStatusUpdate = async (deliveryId, status) => {
    try {
      setSyncing(true);
      let extraPayload = {};

      if (status === "delivered") {
        const tipInput = window.prompt(
          "Nhập tiền tip (VND) nếu có, hoặc để trống:",
          "0"
        );
        const tipAmount = Number(tipInput);
        if (!Number.isNaN(tipAmount) && tipAmount >= 0) {
          extraPayload.tipAmount = tipAmount;
        }
      }

      if (status === "failed") {
        const reason =
          window.prompt(
            "Nhập lý do không giao được đơn:",
            "Không liên lạc được khách hàng"
          ) || "";
        if (!reason.trim()) {
          alert("Bạn cần ghi rõ lý do thất bại.");
          return;
        }
        extraPayload.failureReason = reason.trim();
      }

      const response = await axios.put(
        `${DELIVERY_API_BASE}/delivery/${deliveryId}/status`,
        { status, ...extraPayload },
        { headers: authHeaders }
      );

      if (response.data?.success) {
        await fetchDashboardData();
      } else {
        alert(response.data?.message || "Cập nhật trạng thái thất bại");
      }
    } catch (err) {
      console.error("Update status error", err);
      alert(err.response?.data?.message || "Không thể cập nhật trạng thái");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteDelivery = async (deliveryId) => {
    if (!window.confirm("Bạn có chắc muốn xóa đơn giao hàng này?")) return;
    try {
      setSyncing(true);
      await axios.delete(`${DELIVERY_API_BASE}/delivery/${deliveryId}`, {
        headers: authHeaders,
      });
      await fetchDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || "Không thể xóa bản ghi");
    } finally {
      setSyncing(false);
    }
  };

  if (!token) {
    return null;
  }

  return (
    <div className="driver-dashboard">
      <header className="driver-dashboard__header">
        <div className="driver-hero">
          <p className="driver-overline">Drone Operations Center</p>
          <h1>Xin chào, {profile?.name || "Phi công"}</h1>
          <p>
            Điều phối đội drone giao nhận, theo dõi nhiệm vụ và telemetries theo
            thời gian thực từ bảng điều khiển thống nhất.
          </p>
          <div className="driver-chip-row">
            <span className="driver-chip driver-chip--success">
              Đường truyền realtime sẵn sàng
            </span>
            <span className="driver-chip">Socket: {socketLabel}</span>
            <span className="driver-chip driver-chip--outline">
              {availableJobs.length} nhiệm vụ chờ phân bổ
            </span>
          </div>
        </div>

        <div className="driver-console">
          <div className="driver-console__panel">
            <span>Đội bay đang hoạt động</span>
            <strong>{groupedDeliveries.active.length} drone</strong>
            <small>
              {groupedDeliveries.history.length} nhiệm vụ hoàn thành gần đây
            </small>
          </div>
          <div className="driver-console__panel driver-console__panel--muted">
            <span>Nhiệm vụ cần điều phối</span>
            <strong>{availableJobs.length}</strong>
            <small>Kiểm tra hàng đợi trước khi khởi bay</small>
          </div>
          <div className="driver-console__actions">
            <button
              className="driver-button driver-button--ghost"
              onClick={syncDashboard}
              disabled={syncing}
            >
              {syncing ? "Đồng bộ luồng dữ liệu..." : "Đồng bộ ngay"}
            </button>
            <button
              className="driver-button driver-button--danger"
              onClick={handleLogout}
            >
              Thoát trạm
            </button>
          </div>
        </div>
      </header>

      {error && <div className="driver-alert driver-alert--error">{error}</div>}

      <section className="driver-metrics">
        <div className="driver-metric-card">
          <span className="driver-metric-card__label">Ngân sách bay hôm nay</span>
          <strong>{formatCurrency(stats?.earningsToday || 0)}</strong>
          <small>Nguồn: 90% phí ship + tip khi hoàn thành</small>
        </div>
        <div className="driver-metric-card">
          <span className="driver-metric-card__label">Tổng ngân sách đội bay</span>
          <strong>{formatCurrency(stats?.totalEarnings || 0)}</strong>
        </div>
        <div className="driver-metric-card">
          <span className="driver-metric-card__label">Nhiệm vụ hoàn thành</span>
          <strong>{stats?.delivered || 0}</strong>
        </div>
        <div className="driver-metric-card">
          <span className="driver-metric-card__label">Drone đang bay</span>
          <strong>{stats?.activeDeliveries || 0}</strong>
        </div>
        {typeof stats?.totalShippingFee === "number" && (
          <div className="driver-metric-card driver-metric-card--split">
            <span className="driver-metric-card__label">Dòng tiền giao hàng</span>
            <strong>{formatCurrency(stats.totalShippingFee || 0)}</strong>
            <small>Phần của bạn (90%): {formatCurrency((stats.totalShippingFee || 0) * 0.9)}</small>
            <small>Nhà hàng (10%): {formatCurrency((stats.totalShippingFee || 0) * 0.1)}</small>
          </div>
        )}
      </section>

      <div className="driver-share-banner">
        <strong>Lưu ý vận hành drone:</strong> kiểm tra điện áp pin, liên lạc GPS
        và tình trạng gió trước khi cất cánh. Dòng tiền: 80% giá trị món chuyển
        cho nhà hàng, phí ship phân bổ 90% cho phi công, 10% cho đối tác.
      </div>

      <section className="driver-available-jobs">
        <div className="driver-section-header">
          <h2>Nhiệm vụ chờ điều phối ({availableJobs.length})</h2>
          <button
            className="driver-button driver-button--ghost"
            onClick={fetchAvailableJobs}
            disabled={syncing}
          >
            Làm mới hàng đợi
          </button>
        </div>
        {availableJobs.length === 0 ? (
          <div className="driver-empty">
            Chưa có nhiệm vụ mới. Hệ thống sẽ nhả job khi đơn hàng cần drone.
          </div>
        ) : (
          <div className="driver-job-grid">
            {availableJobs.map((job) => (
              <article className="driver-job-card" key={job.orderId}>
                <div className="driver-job-card__header">
                  <h3>Đơn #{formatOrderCode(job.orderId)}</h3>
                  <span className="driver-tag driver-tag--pending">
                    {getStatusLabel(job.status) || "Chờ phi công"}
                  </span>
                </div>
                <div className="driver-job-card__body">
                  <p>
                    <strong>Người nhận:</strong> {job.customerName || "Ẩn danh"}
                    {formatPhoneNumber(job.customerPhone)
                      ? ` • ${formatPhoneNumber(job.customerPhone)}`
                      : ""}
                  </p>
                  <p>
                    <strong>Nhà hàng:</strong> {job.restaurantName || "—"}
                  </p>
                  <p>
                    <strong>Điểm lấy:</strong>{" "}
                    {job.restaurantLocation || "Chưa cập nhật"}
                  </p>
                  <p>
                    <strong>Điểm thả:</strong> {job.deliveryAddress}
                  </p>
                  <p>
                    <strong>Giá trị đơn:</strong>{" "}
                    {formatCurrency(job.totalPrice || 0)}
                  </p>
                  <p>
                    <strong>Thu nhập dự kiến:</strong>{" "}
                    {job.estimatedPayout
                      ? formatCurrency(job.estimatedPayout)
                      : "Cập nhật sau khi nhận"}
                  </p>
                  <p>
                    <strong>Thanh toán:</strong>{" "}
                    {job.paymentMethod === "card" ? "Thẻ" : "Tiền mặt"}
                  </p>
                </div>
                <div className="driver-job-card__actions">
                  <button
                    className="driver-button driver-button--primary"
                    onClick={() => handleAcceptJob(job)}
                    disabled={syncing}
                  >
                    Nhận nhiệm vụ
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="driver-tabs">
        <div className="driver-tabs__nav">
          <button
            className={`driver-tabs__button ${
              activeTab === "active" ? "is-active" : ""
            }`}
            onClick={() => setActiveTab("active")}
          >
            Nhiệm vụ đang bay ({groupedDeliveries.active.length})
          </button>
          <button
            className={`driver-tabs__button ${
              activeTab === "history" ? "is-active" : ""
            }`}
            onClick={() => setActiveTab("history")}
          >
            Lịch sử nhiệm vụ ({groupedDeliveries.history.length})
          </button>
        </div>

        <div className="driver-tabs__content">
          {loading ? (
            <div className="driver-empty">Đang tải dữ liệu...</div>
          ) : activeTab === "active" ? (
            groupedDeliveries.active.length === 0 ? (
              <div className="driver-empty">Bạn chưa có đơn nào đang xử lý.</div>
            ) : (
              <div className="driver-delivery-list">
                {groupedDeliveries.active.map((delivery) => (
                  <DeliveryCard
                    key={delivery._id}
                    delivery={delivery}
                    onUpdateStatus={handleStatusUpdate}
                    onDelete={handleDeleteDelivery}
                    syncing={syncing}
                  />
                ))}
              </div>
            )
          ) : groupedDeliveries.history.length === 0 ? (
            <div className="driver-empty">
              Chưa có đơn hoàn thành nào để hiển thị.
            </div>
          ) : (
            <div className="driver-delivery-list">
              {groupedDeliveries.history.map((delivery) => (
                <DeliveryCard
                  key={delivery._id}
                  delivery={delivery}
                  onUpdateStatus={handleStatusUpdate}
                  onDelete={handleDeleteDelivery}
                  syncing={syncing}
                  isHistory
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DeliveryCard({
  delivery,
  onUpdateStatus,
  onDelete,
  syncing,
  isHistory = false,
}) {
  const nextActions = useMemo(() => {
    if (isHistory) return [];
    return STATUS_ACTIONS.filter((action) =>
      action.from.includes(delivery.status)
    );
  }, [delivery.status, isHistory]);

  const earnings = formatCurrency(delivery.totalEarnings || 0);
  const tip = formatCurrency(delivery.tipAmount || 0);
  const orderTotal = formatCurrency(
    delivery.orderTotal || delivery.totalPrice || 0
  );
  const financials = delivery.orderFinancials || {};
  const shippingGrossRaw = Number(financials.shippingFee ?? 0);
  const driverNetRaw = Number(
    financials.driverNet ??
      financials.driverPayout ??
      delivery.totalEarnings ??
      0
  );
  const driverServiceFeeRaw =
    financials.driverServiceFee != null
      ? Number(financials.driverServiceFee)
      : Math.max(0, shippingGrossRaw - driverNetRaw);
  const shippingGross = formatCurrency(shippingGrossRaw);
  const driverNetShipping = formatCurrency(driverNetRaw);
  const driverServiceFee = formatCurrency(driverServiceFeeRaw);
  const customerPhone = formatPhoneNumber(delivery.customerPhone);
  const earningsLabel = isHistory ? "Thu nhập thực nhận" : "Thu nhập dự kiến";

  return (
    <article className="driver-delivery-card">
      <div className="driver-delivery-card__header">
        <div>
          <h3>Nhiệm vụ #{formatOrderCode(delivery.orderId)}</h3>
          <p className="driver-delivery-card__subtitle">
            {delivery.customerName || "Khách lẻ"}
            {customerPhone ? ` • ${customerPhone}` : ""}
          </p>
        </div>
        <span
          className={`driver-tag driver-tag--${delivery.status || "default"}`}
        >
          {getStatusLabel(delivery.status)}
        </span>
      </div>

      <div className="driver-delivery-card__grid">
        <div>
          <h4>Người nhận</h4>
          <p>{delivery.customerName || "Không rõ"}</p>
          {customerPhone ? <p>{customerPhone}</p> : null}
        </div>
        <div>
          <h4>Bãi cất cánh</h4>
          <p>{delivery.pickupAddressString || delivery.restaurantName}</p>
        </div>
        <div>
          <h4>Bãi hạ cánh</h4>
          <p>{delivery.deliveryAddressString || delivery.deliveryAddress}</p>
        </div>
        <div>
          <h4>Tài chính</h4>
          <p>Tổng đơn: {orderTotal}</p>
          <p>Phí ship gộp: {shippingGross}</p>
          <p>Phí dịch vụ tài xế: {driverServiceFee}</p>
          <p>Thu nhập ship ròng: {driverNetShipping}</p>
          <p>
            {earningsLabel}: {earnings}
          </p>
          <p>Tiền tip: {tip}</p>
          {delivery.distanceKm ? (
            <p>Quãng đường: {delivery.distanceKm} km</p>
          ) : null}
        </div>
      </div>

      <div className="driver-delivery-card__meta">
        <small>Nhận: {formatDateTime(delivery.createdAt)}</small>
        <small>Cập nhật: {formatDateTime(delivery.updatedAt)}</small>
      </div>

      {delivery.failureReason && (
        <div className="driver-alert driver-alert--warning">
          Lý do thất bại: {delivery.failureReason}
        </div>
      )}

      <div className="driver-delivery-card__actions">
        {!isHistory &&
          nextActions.map((action) => (
            <button
              key={action.to}
              className={`driver-button driver-button--${action.color}`}
              onClick={() => onUpdateStatus(delivery._id, action.to)}
              disabled={syncing}
            >
              {action.label}
            </button>
          ))}
        {isHistory && (
          <button
            className="driver-button driver-button--ghost"
            onClick={() => onDelete(delivery._id)}
            disabled={syncing}
          >
            Xóa bản ghi
          </button>
        )}
      </div>
    </article>
  );
}
