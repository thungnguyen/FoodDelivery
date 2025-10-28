// src/pages/auth/AuthRegister.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import {
  FiMail,
  FiPhone,
  FiLock,
  FiMapPin,
  FiUser,
  FiUserPlus,
  FiCheckCircle,
} from "react-icons/fi";
import { AUTH_SERVICE_URL } from "../../utils/serviceUrls";
import { setAuthToken, AUTH_ROLES } from "../../utils/authTokens";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import "../../styles/auth.css";

export default function AuthRegister() {
  const [form, setForm] = useState({
    firstName: "", lastName: "",
    email: "", phone: "",
    password: "", location: "",
  });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await axios.post(`${AUTH_SERVICE_URL}/api/auth/register/customer`, form);
      setAuthToken(AUTH_ROLES.CUSTOMER, res.data.token);
      navigate("/customer/profile");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    }
  };

  return (
    <div className="auth-page">
      <Header />
      <main className="auth-main">
        <div className="auth-layout">
          <section className="auth-card">
            <div className="auth-card__header">
              <span className="auth-card__icon">
                <FiUserPlus />
              </span>
              <div>
                <h2>Đăng ký tài khoản</h2>
                <p>Gia nhập cộng đồng giao đồ ăn, lưu món yêu thích & nhận ưu đãi cá nhân hoá.</p>
              </div>
            </div>

            {error && <div className="auth-message error">{error}</div>}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-form-grid">
                <label className="auth-field">
                  <span className="auth-field__label">
                    <FiUser /> Họ *
                  </span>
                  <input
                    name="firstName"
                    placeholder="VD: Nguyễn"
                    onChange={handleChange}
                    value={form.firstName}
                    required
                  />
                </label>
                <label className="auth-field">
                  <span className="auth-field__label">
                    <FiUser /> Tên *
                  </span>
                  <input
                    name="lastName"
                    placeholder="VD: Minh An"
                    onChange={handleChange}
                    value={form.lastName}
                    required
                  />
                </label>
                <label className="auth-field">
                  <span className="auth-field__label">
                    <FiMail /> Email *
                  </span>
                  <input
                    name="email"
                    type="email"
                    placeholder="email@domain.com"
                    onChange={handleChange}
                    value={form.email}
                    required
                  />
                </label>
                <label className="auth-field">
                  <span className="auth-field__label">
                    <FiPhone /> Số điện thoại *
                  </span>
                  <input
                    name="phone"
                    placeholder="0987 654 321"
                    onChange={handleChange}
                    value={form.phone}
                    required
                  />
                </label>
                <label className="auth-field">
                  <span className="auth-field__label">
                    <FiLock /> Mật khẩu *
                  </span>
                  <input
                    name="password"
                    type="password"
                    placeholder="Tối thiểu 6 ký tự"
                    onChange={handleChange}
                    value={form.password}
                    required
                  />
                </label>
                <label className="auth-field">
                  <span className="auth-field__label">
                    <FiMapPin /> Khu vực
                  </span>
                  <input
                    name="location"
                    placeholder="Quận/Huyện, Thành phố"
                    onChange={handleChange}
                    value={form.location}
                  />
                </label>
              </div>
              <button className="auth-submit" type="submit">
                Tạo tài khoản
              </button>
            </form>

            <p className="auth-alt">
              Đã có tài khoản? <Link to="/auth/login">Đăng nhập ngay</Link>
            </p>
          </section>

          <aside className="auth-showcase">
            <span className="auth-showcase__tag">Ưu đãi cho bạn</span>
            <h3>Khám phá hàng trăm nhà hàng & ship siêu tốc.</h3>
            <p>
              Cập nhật liên tục các chương trình giảm giá, tích điểm đổi quà và theo dõi trạng
              thái đơn hàng theo thời gian thực.
            </p>
            <ul className="auth-benefits">
              <li>
                <FiCheckCircle /> Đặt món chỉ với vài chạm
              </li>
              <li>
                <FiCheckCircle /> Lưu nhà hàng & món khoái khẩu
              </li>
              <li>
                <FiCheckCircle /> Theo dõi tài xế và thời gian giao hàng
              </li>
            </ul>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
