import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../styles/restaurantLogin.css';
import { RESTAURANT_SERVICE_URL } from '../../../utils/serviceUrls';

const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const validatorMap = {
  email: (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Vui lòng nhập email';
    }
    if (!emailRegex.test(trimmed)) {
      return 'Email không hợp lệ';
    }
    return '';
  },
  password: (value) => {
    if (!value.trim()) {
      return 'Vui lòng nhập mật khẩu tạm thời';
    }
    if (value.trim().length < 6) {
      return 'Mật khẩu tạm thời tối thiểu 6 ký tự';
    }
    return '';
  },
  otp: (value) => {
    if (!value.trim()) {
      return 'Vui lòng nhập OTP';
    }
    if (!/^\d{6}$/.test(value.trim())) {
      return 'OTP phải gồm 6 chữ số';
    }
    return '';
  },
};

const runFullValidation = (formState) => {
  return Object.keys(validatorMap).reduce(
    (acc, key) => ({
      ...acc,
      [key]: validatorMap[key](formState[key] || ''),
    }),
    { email: '', password: '', otp: '' }
  );
};

const RestaurantOnboardingVerify = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get('email') || '', [searchParams]);

  const [form, setForm] = useState({
    email: initialEmail,
    password: '',
    otp: '',
  });
  const [errors, setErrors] = useState({
    email: '',
    password: '',
    otp: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (validatorMap[name]) {
      setErrors((prev) => ({ ...prev, [name]: validatorMap[name](value) }));
    }
  };

  const handleOtpChange = (e) => {
    const { value } = e.target;
    if (/^\d{0,6}$/.test(value)) {
      handleChange({ target: { name: 'otp', value } });
    }
  };

  const validateForm = () => {
    const currentErrors = runFullValidation(form);
    setErrors(currentErrors);
    return Object.values(currentErrors).every((msg) => msg === '');
  };

  const isReadyToSubmit =
    form.email.trim().length > 0 &&
    form.password.trim().length >= 6 &&
    form.otp.length === 6 &&
    Object.values(errors).every((msg) => msg === '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback({ type: '', text: '' });

    if (!validateForm()) {
      setFeedback({ type: 'error', text: 'Vui lòng kiểm tra lại thông tin.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${RESTAURANT_SERVICE_URL}/api/restaurants/onboarding/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          otp: form.otp,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: data.message || 'Xác thực OTP thành công. Đang chuyển đến trang đổi mật khẩu...',
        });
        setTimeout(() => {
          navigate(
            `/restaurant/activate/change-password?token=${encodeURIComponent(
              data.resetToken
            )}&email=${encodeURIComponent(form.email.trim())}`
          );
        }, 800);
      } else {
        setFeedback({
          type: 'error',
          text: data.message || 'Không thể xác thực OTP. Vui lòng thử lại.',
        });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        text: 'Không thể xác thực OTP. Vui lòng thử lại.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendActivation = async () => {
    const emailError = validatorMap.email(form.email || '');
    if (emailError) {
      setErrors((prev) => ({ ...prev, email: emailError }));
      setFeedback({ type: 'error', text: emailError });
      return;
    }

    setIsResending(true);
    try {
      const res = await fetch(`${RESTAURANT_SERVICE_URL}/api/restaurants/onboarding/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: data.message || 'Đã gửi lại thông tin kích hoạt. Vui lòng kiểm tra email.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: data.message || 'Không thể gửi lại thông tin kích hoạt. Vui lòng thử lại.',
        });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        text: 'Không thể gửi lại thông tin kích hoạt. Vui lòng thử lại.',
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="restaurant-auth-wrapper">
      <div className="restaurant-auth-card">
        <h2>Kích hoạt tài khoản nhà hàng</h2>
        <p className="helper-text">
          Nhập email đăng ký, mật khẩu tạm thời và mã OTP được gửi từ hệ thống. OTP chỉ có hiệu lực trong 5 phút sau khi email phê duyệt được gửi đi.
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
            <span className="input-label">Mật khẩu tạm thời</span>
            <input
              type="password"
              name="password"
              placeholder="Nhập mật khẩu tạm thời"
              value={form.password}
              onChange={handleChange}
              className={errors.password ? 'has-error' : ''}
            />
            {errors.password && <span className="error-text">{errors.password}</span>}
          </label>

          <label className="input-wrapper">
            <span className="input-label">Mã OTP (6 chữ số)</span>
            <input
              type="text"
              name="otp"
              placeholder="Ví dụ: 123456"
              value={form.otp}
              onChange={handleOtpChange}
              className={errors.otp ? 'has-error' : ''}
              inputMode="numeric"
            />
            {errors.otp && <span className="error-text">{errors.otp}</span>}
          </label>

          {feedback.text && (
            <div className={`form-alert ${feedback.type}`}>
              {feedback.text}
            </div>
          )}

          <button type="submit" disabled={!isReadyToSubmit || isSubmitting}>
            {isSubmitting ? 'Đang xác thực...' : 'Xác thực OTP'}
          </button>
        </form>
        <div className="auth-actions">
          <button
            type="button"
            className="link-button"
            onClick={handleResendActivation}
            disabled={isResending}
          >
            {isResending ? 'Đang gửi lại...' : 'Gửi lại thông tin kích hoạt'}
          </button>
          <button type="button" className="link-button" onClick={() => navigate('/restaurant/login')}>
            Quay lại đăng nhập
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestaurantOnboardingVerify;
