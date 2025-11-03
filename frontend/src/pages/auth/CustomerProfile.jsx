import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AUTH_SERVICE_URL } from "../../utils/serviceUrls";
import { getAuthToken, AUTH_ROLES } from "../../utils/authTokens";
const pageWrapperStyle = {
  minHeight: "100vh",
  background: "linear-gradient(140deg, #f6f8ff 0%, #fef9f2 100%)",
  padding: "36px 20px 60px",
  display: "flex",
  justifyContent: "center",
};

const inputStyle = {
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid rgba(15, 23, 42, 0.12)",
  width: "100%",
  fontSize: "15px",
  transition: "box-shadow 0.2s ease, border 0.2s ease",
  outline: "none",
  background: "rgba(255,255,255,0.9)",
};

const labelStyle = {
  display: "block",
  fontWeight: 600,
  marginBottom: "6px",
  color: "#1f2937",
};

export default function CustomerProfile() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    location: "",
  });
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState({ type: "", message: "" });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      setError("");
      try {
        const token = getAuthToken(AUTH_ROLES.CUSTOMER);
        if (!token) {
          setError("Bạn cần đăng nhập để xem thông tin.");
          setLoading(false);
          return;
        }
        const res = await axios.get(`${AUTH_SERVICE_URL}/api/auth/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const customer = res.data?.data?.customer;
        if (customer) {
          const snapshot = {
            firstName: customer.firstName || "",
            lastName: customer.lastName || "",
            email: customer.email || "",
            phone: customer.phone || "",
            location: customer.location || "",
          };
          setFormData(snapshot);
          setInitialSnapshot({ ...snapshot });
        }
      } catch (err) {
        setError(err.response?.data?.message || "Không thể tải thông tin khách hàng.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePasswordFieldChange = (field) => (event) => {
    const value = event.target.value;
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (passwordSaving) return;
    setPasswordFeedback({ type: "", message: "" });

    const current = passwordForm.currentPassword.trim();
    const next = passwordForm.newPassword.trim();
    const confirm = passwordForm.confirmPassword.trim();

    if (!current || !next || !confirm) {
      setPasswordFeedback({
        type: "error",
        message: "Vui lòng nhập đầy đủ các trường mật khẩu.",
      });
      return;
    }

    if (next !== confirm) {
      setPasswordFeedback({
        type: "error",
        message: "Xác nhận mật khẩu mới không khớp.",
      });
      return;
    }

    if (next === current) {
      setPasswordFeedback({
        type: "error",
        message: "Mật khẩu mới phải khác mật khẩu hiện tại.",
      });
      return;
    }

    if (next.length < 6) {
      setPasswordFeedback({
        type: "error",
        message: "Mật khẩu mới phải có tối thiểu 6 ký tự.",
      });
      return;
    }

    try {
      setPasswordSaving(true);
      const token = getAuthToken(AUTH_ROLES.CUSTOMER);
      if (!token) {
        setPasswordFeedback({
          type: "error",
          message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
        });
        navigate("/auth/login");
        return;
      }

      await axios.patch(
        `${AUTH_SERVICE_URL}/api/auth/customer/password`,
        {
          currentPassword: current,
          newPassword: next,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setPasswordFeedback({
        type: "success",
        message: "Cập nhật mật khẩu thành công.",
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      const message =
        err.response?.data?.message ||
        "Đổi mật khẩu thất bại, vui lòng thử lại.";
      setPasswordFeedback({
        type: "error",
        message,
      });
      if (err.response?.status === 401) {
        navigate("/auth/login");
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  const hasChanges = useMemo(() => {
    if (!initialSnapshot) return false;
    return Object.keys(initialSnapshot).some(
      (key) => (initialSnapshot[key] || "") !== (formData[key] || "")
    );
  }, [formData, initialSnapshot]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!hasChanges) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = getAuthToken(AUTH_ROLES.CUSTOMER);
      await axios.patch(
        `${AUTH_SERVICE_URL}/api/auth/customer/profile`,
        {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          location: formData.location,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setInitialSnapshot({ ...formData });
      setSuccess("Cập nhật thông tin thành công!");
    } catch (err) {
      setError(err.response?.data?.message || "Cập nhật thất bại, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "18px", color: "#475569" }}>Đang tải thông tin...</span>
      </div>
    );
  }

  return (
    <div style={pageWrapperStyle}>
      <div style={{ width: "100%", maxWidth: "860px" }}>
        <button
          onClick={() => navigate("/customer/home")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "12px",
            border: "1px solid rgba(15,23,42,0.12)",
            background: "rgba(255,255,255,0.85)",
            color: "#1f2937",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 12px 24px rgba(15,23,42,0.08)",
            backdropFilter: "blur(6px)",
            marginBottom: "22px",
          }}
        >
          ← Trở lại trang chính
        </button>

        <div
          style={{
            background: "linear-gradient(130deg, rgba(255,255,255,0.97), rgba(238,246,255,0.9))",
            borderRadius: "28px",
            boxShadow: "0 24px 50px rgba(15, 23, 42, 0.14)",
            padding: "42px 40px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at top right, rgba(255,123,89,0.16), transparent 38%) , radial-gradient(circle at bottom left, rgba(80,130,255,0.18), transparent 42%)",
              zIndex: 0,
            }}
          />

          <div style={{ position: "relative", zIndex: 1, display: "grid", gap: "26px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "999px",
                    backgroundColor: "rgba(59,130,246,0.14)",
                    color: "#1d4ed8",
                    fontWeight: 600,
                    fontSize: "13px",
                    letterSpacing: "0.4px",
                  }}
                >
                  Hồ sơ khách hàng
                </span>
                <h1
                  style={{
                    margin: "16px 0 10px",
                    fontSize: "32px",
                    lineHeight: 1.2,
                    color: "#0f172a",
                  }}
                >
                  Cập nhật thông tin cá nhân
                </h1>
                <p style={{ margin: 0, color: "#475569", fontSize: "15px", maxWidth: "560px", lineHeight: 1.6 }}>
                  Điều chỉnh thông tin liên hệ và địa chỉ giao hàng của bạn để các đơn hàng luôn được giao nhanh và chính xác.
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "18px",
                }}
              >
                <div
                  style={{
                    padding: "12px 18px",
                    borderRadius: "16px",
                    background: "rgba(59,130,246,0.12)",
                    color: "#1d4ed8",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  ✨ Thông tin chỉnh sửa sẽ có hiệu lực ngay lập tức
                </div>
                {success && (
                  <div
                    style={{
                      padding: "12px 18px",
                      borderRadius: "16px",
                      background: "rgba(74,222,128,0.14)",
                      color: "#047857",
                      fontWeight: 600,
                      fontSize: "14px",
                    }}
                  >
                    {success}
                  </div>
                )}
                {error && (
                  <div
                    style={{
                      padding: "12px 18px",
                      borderRadius: "16px",
                      background: "rgba(248,113,113,0.12)",
                      color: "#b91c1c",
                      fontWeight: 600,
                      fontSize: "14px",
                    }}
                  >
                    {error}
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "22px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
                <label>
                  <span style={labelStyle}>Họ</span>
                  <input
                    style={inputStyle}
                    value={formData.firstName}
                    onChange={handleChange("firstName")}
                    placeholder="Nhập họ"
                  />
                </label>
                <label>
                  <span style={labelStyle}>Tên</span>
                  <input
                    style={inputStyle}
                    value={formData.lastName}
                    onChange={handleChange("lastName")}
                    placeholder="Nhập tên"
                  />
                </label>
              </div>
              <label>
                <span style={labelStyle}>Email</span>
                <input
                  style={{ ...inputStyle, backgroundColor: "rgba(248,250,252,0.9)", cursor: "not-allowed" }}
                  value={formData.email}
                  disabled
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
                <label>
                  <span style={labelStyle}>Số điện thoại</span>
                  <input
                    style={inputStyle}
                    value={formData.phone}
                    onChange={handleChange("phone")}
                    placeholder="Nhập số điện thoại"
                  />
                </label>
                <label>
                  <span style={labelStyle}>Địa chỉ giao hàng</span>
                  <input
                    style={inputStyle}
                    value={formData.location}
                    onChange={handleChange("location")}
                    placeholder="Nhập địa chỉ giao hàng"
                  />
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "14px",
                  flexWrap: "wrap",
                  marginTop: "8px",
                }}
              >
                <button
                  type="button"
                  onClick={() => initialSnapshot && setFormData(initialSnapshot)}
                  disabled={!hasChanges || saving}
                  style={{
                    padding: "12px 24px",
                    borderRadius: "999px",
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: "white",
                    color: "#1f2937",
                    fontWeight: 600,
                    cursor: hasChanges && !saving ? "pointer" : "not-allowed",
                    opacity: hasChanges && !saving ? 1 : 0.55,
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  }}
                >
                  Đặt lại
                </button>
                <button
                  type="submit"
                  disabled={!hasChanges || saving}
                  style={{
                    padding: "12px 30px",
                    borderRadius: "999px",
                    border: "none",
                    background: "linear-gradient(135deg, #ff8147 0%, #ff5c8d 100%)",
                    color: "white",
                    fontWeight: 700,
                    letterSpacing: "0.4px",
                    cursor: hasChanges && !saving ? "pointer" : "not-allowed",
                    boxShadow: "0 14px 24px rgba(255, 126, 109, 0.38)",
                    opacity: hasChanges && !saving ? 1 : 0.55,
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  }}
                >
                  {saving ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
            <div
              style={{
                marginTop: "36px",
                padding: "26px 24px 30px",
                borderRadius: "22px",
                background: "#ffffff",
                boxShadow: "0 18px 36px rgba(15,23,42,0.08)",
                display: "grid",
                gap: "18px",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "24px",
                    color: "#0f172a",
                    fontWeight: 700,
                  }}
                >
                  Bảo mật tài khoản
                </h2>
                <p style={{ margin: "6px 0 0", color: "#475569", fontSize: "15px" }}>
                  Đổi mật khẩu định kỳ giúp tài khoản của bạn an toàn hơn.
                </p>
              </div>
              {passwordFeedback.message && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "14px",
                    background:
                      passwordFeedback.type === "success"
                        ? "rgba(74,222,128,0.14)"
                        : "rgba(248,113,113,0.12)",
                    color: passwordFeedback.type === "success" ? "#047857" : "#b91c1c",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  {passwordFeedback.message}
                </div>
              )}
              <form onSubmit={handlePasswordSubmit} style={{ display: "grid", gap: "18px" }}>
                <label>
                  <span style={labelStyle}>Mật khẩu hiện tại</span>
                  <input
                    type="password"
                    style={inputStyle}
                    placeholder="Nhập mật khẩu đang dùng"
                    value={passwordForm.currentPassword}
                    onChange={handlePasswordFieldChange("currentPassword")}
                  />
                </label>
                <label>
                  <span style={labelStyle}>Mật khẩu mới</span>
                  <input
                    type="password"
                    style={inputStyle}
                    placeholder="Ít nhất 6 ký tự"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordFieldChange("newPassword")}
                  />
                </label>
                <label>
                  <span style={labelStyle}>Xác nhận mật khẩu mới</span>
                  <input
                    type="password"
                    style={inputStyle}
                    placeholder="Nhập lại mật khẩu mới"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordFieldChange("confirmPassword")}
                  />
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    disabled={passwordSaving}
                    style={{
                      padding: "12px 28px",
                      borderRadius: "999px",
                      border: "none",
                      background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
                      color: "white",
                      fontWeight: 700,
                      cursor: passwordSaving ? "not-allowed" : "pointer",
                      boxShadow: "0 16px 32px rgba(124,58,237,0.28)",
                      opacity: passwordSaving ? 0.6 : 1,
                      transition: "transform 0.2s ease, box-shadow 0.2s ease",
                    }}
                  >
                    {passwordSaving ? "Đang cập nhật..." : "Đổi mật khẩu"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
