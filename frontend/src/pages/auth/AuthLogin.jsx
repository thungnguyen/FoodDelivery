// src/pages/auth/AuthLogin.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { FiMail, FiLock, FiLogIn, FiCheckCircle } from "react-icons/fi";
import { AUTH_SERVICE_URL } from "../../utils/serviceUrls";
import { setAuthToken, AUTH_ROLES } from "../../utils/authTokens";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import "../../styles/auth.css";

export default function AuthLogin() {
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    setCredentials(c => ({ ...c, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await axios.post(`${AUTH_SERVICE_URL}/api/auth/login`, credentials);
      setAuthToken(AUTH_ROLES.CUSTOMER, res.data.token);
      localStorage.setItem("userRole", "customer");
      navigate("/customer/home");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    }
  };

  return (
    <div className="auth-page">
      <Header />
      <main className="auth-main">
        <div className="auth-layout auth-layout--compact">
          <section className="auth-card">
            <div className="auth-card__header">
              <span className="auth-card__icon auth-card__icon--accent">
                <FiLogIn />
              </span>
              <div>
                <h2>Đăng nhập</h2>
                <p>Chào mừng trở lại! Tiếp tục hành trình ẩm thực của bạn.</p>
              </div>
            </div>

            {error && <div className="auth-message error">{error}</div>}

            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-field">
                <span className="auth-field__label">
                  <FiMail /> Email
                </span>
                <input
                  name="email"
                  type="email"
                  placeholder="email@domain.com"
                  onChange={handleChange}
                  value={credentials.email}
                  required
                />
              </label>
              <label className="auth-field">
                <span className="auth-field__label">
                  <FiLock /> Mật khẩu
                </span>
                <input
                  name="password"
                  type="password"
                  placeholder="Nhập mật khẩu của bạn"
                  onChange={handleChange}
                  value={credentials.password}
                  required
                />
              </label>
              <button className="auth-submit" type="submit">
                Đăng nhập
              </button>
            </form>

            <p className="auth-alt">
              Chưa có tài khoản? <Link to="/auth/register">Đăng ký ngay</Link>
            </p>
          </section>

          <aside className="auth-showcase auth-showcase--login">
            <h3>Đăng nhập để:</h3>
            <ul className="auth-benefits">
              <li>
                <FiCheckCircle /> Theo dõi đơn hàng mọi lúc
              </li>
              <li>
                <FiCheckCircle /> Nhận ưu đãi dành riêng cho bạn
              </li>
              <li>
                <FiCheckCircle /> Lưu lịch sử đặt & đánh giá món
              </li>
            </ul>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
