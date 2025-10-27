import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/restaurantLogin.css';
import { RESTAURANT_SERVICE_URL } from '../../../utils/serviceUrls';

const passwordPolicyRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

const validatePassword = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Mật khẩu mới là bắt buộc';
  }
  if (!passwordPolicyRegex.test(trimmed)) {
    return 'Mật khẩu phải tối thiểu 6 ký tự, gồm chữ, số và ký tự đặc biệt';
  }
  return '';
};

const RestaurantOnboardingSetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const resetToken = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [form, setForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = () => {
    const newErrors = {
      newPassword: validatePassword(form.newPassword),
      confirmPassword: '',
    };

    if (!form.confirmPassword.trim()) {
      newErrors.confirmPassword = 'Vui lòng nhập lại mật khẩu';
    } else if (form.newPassword.trim() !== form.confirmPassword.trim()) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
    }

    setErrors(newErrors);
    return Object.values(newErrors).every((msg) => msg === '');
  };

  const isReadyToSubmit =
    Boolean(resetToken) &&
    form.newPassword.length > 0 &&
    form.confirmPassword.length > 0 &&
    Object.values(errors).every((msg) => msg === '');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    if (name === 'newPassword') {
      setErrors((prev) => ({
        ...prev,
        newPassword: validatePassword(value),
        confirmPassword:
          form.confirmPassword.trim().length === 0
            ? prev.confirmPassword
            : value.trim() === form.confirmPassword.trim()
            ? ''
            : 'Mật khẩu xác nhận không khớp',
      }));
    }
    if (name === 'confirmPassword') {
      setErrors((prev) => ({
        ...prev,
        confirmPassword:
          value.trim() === form.newPassword.trim() ? '' : 'Mật khẩu xác nhận không khớp',
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback({ type: '', text: '' });

    if (!resetToken) {
      setFeedback({
        type: 'error',
        text: 'Token đặt lại mật khẩu không hợp lệ. Vui lòng quay lại bước nhập OTP.',
      });
      return;
    }

    if (!validateForm()) {
      setFeedback({ type: 'error', text: 'Vui lòng kiểm tra lại thông tin.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${RESTAURANT_SERVICE_URL}/api/restaurants/onboarding/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          newPassword: form.newPassword,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: data.message || 'Đổi mật khẩu thành công. Đang chuyển đến trang đăng nhập...',
        });
        setTimeout(() => {
          navigate('/restaurant/login', { replace: true });
        }, 1200);
      } else {
        setFeedback({
          type: 'error',
          text: data.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.',
        });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        text: 'Không thể đổi mật khẩu. Vui lòng thử lại.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="restaurant-auth-wrapper">
      <div className="restaurant-auth-card">
        <h2>Đặt lại mật khẩu</h2>
        <p className="helper-text">
          {resetToken
            ? `Đặt mật khẩu mới cho tài khoản nhà hàng${email ? ` (${email})` : ''}. Hãy tạo mật khẩu đủ mạnh để bảo vệ tài khoản.`
            : 'Không tìm thấy token xác thực. Vui lòng quay lại bước nhập OTP để nhận token mới.'}
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="input-wrapper">
            <span className="input-label">Mật khẩu mới</span>
            <input
              type="password"
              name="newPassword"
              placeholder="Tối thiểu 6 ký tự, có số và ký tự đặc biệt"
              value={form.newPassword}
              onChange={handleChange}
              className={errors.newPassword ? 'has-error' : ''}
            />
            {errors.newPassword && <span className="error-text">{errors.newPassword}</span>}
          </label>

          <label className="input-wrapper">
            <span className="input-label">Xác nhận mật khẩu</span>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Nhập lại mật khẩu mới"
              value={form.confirmPassword}
              onChange={handleChange}
              className={errors.confirmPassword ? 'has-error' : ''}
            />
            {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
          </label>

          {feedback.text && (
            <div className={`form-alert ${feedback.type}`}>
              {feedback.text}
            </div>
          )}

          <button type="submit" disabled={!isReadyToSubmit || isSubmitting}>
            {isSubmitting ? 'Đang lưu...' : 'Đổi mật khẩu'}
          </button>
        </form>
        <div className="auth-actions">
          <button
            type="button"
            className="link-button"
            onClick={() => navigate('/restaurant/activate')}
          >
            Quay lại nhập OTP
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => navigate('/restaurant/login')}
          >
            Đến trang đăng nhập
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestaurantOnboardingSetPassword;
