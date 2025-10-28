import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FiMail, FiLock, FiTruck } from "react-icons/fi";
import "./Login.css";
import { setDriverSession } from "../utils/driverSession";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", text: "" });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (feedback.text) {
      setFeedback({ type: "", text: "" });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await axios.post("http://localhost:5003/api/auth/login", form);

      if (res.data?.success) {
        const { token, data } = res.data;
        setDriverSession({ token, driver: data });
        setFeedback({ type: "success", text: "Đăng nhập thành công! Đang chuyển đến bảng điều khiển..." });
        setTimeout(() => navigate("/dashboard"), 800);
      } else {
        setFeedback({ type: "error", text: res.data?.message || "Không thể đăng nhập, vui lòng thử lại." });
      }
    } catch (err) {
      const errorMessage =
        err.response?.data?.errors?.[0] ||
        err.response?.data?.message ||
        err.message ||
        "Đăng nhập thất bại. Vui lòng thử lại sau.";
      setFeedback({ type: "error", text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="driver-auth-page">
      <section className="driver-auth-card">
        <div className="driver-auth-header">
          <span className="driver-auth-icon">
            <FiTruck />
          </span>
          <div>
            <h2>Tài xế giao hàng</h2>
            <p>Đăng nhập để nhận đơn, cập nhật trạng thái giao và theo dõi thu nhập theo thời gian thực.</p>
          </div>
        </div>

        <form className="driver-auth-form" onSubmit={handleSubmit}>
          <label className="driver-field">
            <span className="driver-field-label">
              <FiMail /> Email
            </span>
            <input
              name="email"
              type="email"
              placeholder="driver@domain.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </label>

          <label className="driver-field">
            <span className="driver-field-label">
              <FiLock /> Mật khẩu
            </span>
            <input
              name="password"
              type="password"
              placeholder="Nhập mật khẩu"
              value={form.password}
              onChange={handleChange}
              required
            />
          </label>

          {feedback.text && (
            <div className={`driver-feedback ${feedback.type}`}>{feedback.text}</div>
          )}

          <button className="driver-submit" type="submit" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </section>

      <aside className="driver-side-panel">
        <h3>Kết nối nhanh, thu nhập chủ động</h3>
        <p>Chủ động nhận đơn gần bạn, cập nhật vị trí tức thời và tối ưu lộ trình giao hàng.</p>
        <div className="driver-badges">
          <span className="driver-badge">Tối ưu lộ trình</span>
          <span className="driver-badge">Theo dõi doanh thu</span>
          <span className="driver-badge">Thông báo tức thời</span>
        </div>
        <p className="driver-note">Chưa có tài khoản? Liên hệ quản trị viên để được kích hoạt.</p>
      </aside>
    </div>
  );
}
