// src/components/RestaurantLogin.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/restaurantLogin.css';
import { RESTAURANT_SERVICE_URL } from '../../../utils/serviceUrls';
import { setAuthToken, AUTH_ROLES } from '../../../utils/authTokens';

function RestaurantLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [errors, setErrors] = useState({
    email: '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    validate(name, value);
  };

  // Real-time field validation
  const validate = (name, value) => {
    const errorsCopy = { ...errors };

    switch (name) {
      case 'email': {
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        errorsCopy.email = emailRegex.test(value.trim())
          ? ''
          : 'Vui lòng nhập email hợp lệ';
        break;
      }
      case 'password':
        errorsCopy.password =
          value.trim().length >= 6 ? '' : 'Mật khẩu tối thiểu 6 ký tự';
        break;
      default:
        break;
    }

    setErrors(errorsCopy);
  };

  const validateForm = () => {
    return (
      form.email.trim() !== '' &&
      form.password.trim() !== '' &&
      Object.values(errors).every((err) => err === '')
    );
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      setFeedback({
        type: 'error',
        text: 'Vui lòng kiểm tra lại thông tin đăng nhập.',
      });
      return;
    }

    setFeedback({ type: '', text: '' });
    setIsSubmitting(true);

    try {
      const res = await fetch(`${RESTAURANT_SERVICE_URL}/api/restaurants/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (res.ok) {
        setAuthToken(AUTH_ROLES.RESTAURANT, data.token);
        setFeedback({
          type: 'success',
          text: 'Đăng nhập thành công! Đang chuyển tới bảng điều khiển...',
        });
        setTimeout(() => {
          navigate('/restaurant/dashboard');
        }, 1000);
      } else if (res.status === 403 && data?.requiresPasswordChange) {
        setFeedback({
          type: 'error',
          text:
            data.message ||
            'Tài khoản cần kích hoạt bằng OTP và mật khẩu tạm thời trước khi đăng nhập.',
        });
        setTimeout(() => {
          navigate(`/restaurant/activate?email=${encodeURIComponent(form.email.trim())}`);
        }, 1200);
      } else {
        setFeedback({
          type: 'error',
          text: data.message || 'Không thể đăng nhập. Vui lòng thử lại.',
        });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        text: 'Không thể kết nối tới máy chủ. Vui lòng thử lại sau.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="restaurant-auth-wrapper">
      <div className="restaurant-auth-card">
        <h2>Đăng nhập nhà hàng</h2>
        <p className="helper-text">
          Sử dụng email quản trị đã được duyệt. Nếu chưa kích hoạt, hãy nhập OTP để đổi mật khẩu.
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="input-wrapper">
            <span className="input-label">Email quản trị</span>
            <input
              type="email"
              name="email"
              placeholder="contact@yourrestaurant.vn"
              value={form.email}
              onChange={handleChange}
              className={errors.email ? 'has-error' : ''}
            />
            {errors.email && <span className="error-text">{errors.email}</span>}
          </label>

          <label className="input-wrapper">
            <span className="input-label">Mật khẩu</span>
            <input
              type="password"
              name="password"
              placeholder="Nhập mật khẩu"
              value={form.password}
              onChange={handleChange}
              className={errors.password ? 'has-error' : ''}
            />
            {errors.password && <span className="error-text">{errors.password}</span>}
          </label>

          {feedback.text && (
            <div className={`form-alert ${feedback.type}`}>
              {feedback.text}
            </div>
          )}

          <button type="submit" disabled={!validateForm() || isSubmitting}>
            {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="auth-actions">
          <button
            type="button"
            className="link-button"
            onClick={() => navigate('/restaurant/activate')}
          >
            Đã nhận OTP? Kích hoạt tại đây
          </button>
        </div>
      </div>
    </div>
  );
}

export default RestaurantLogin;
