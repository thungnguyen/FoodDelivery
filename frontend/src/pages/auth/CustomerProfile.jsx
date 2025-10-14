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
          </div>
        </div>
      </div>
    </div>
  );
}
