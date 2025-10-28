import React, { useState } from 'react';
import { FiMail, FiLock, FiShield } from 'react-icons/fi';
import '../styles/login.css';
import { useNavigate } from 'react-router-dom';
import { RESTAURANT_SERVICE_URL } from '../../../utils/serviceUrls';
import { setAuthToken, AUTH_ROLES } from '../../../utils/authTokens';

function SuperAdminLogin() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [errors, setErrors] = useState({ email: '', password: '' });
  const navigate = useNavigate();

  const validate = (name, value) => {
    let error = '';

    if (name === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!value) error = 'Email is required';
      else if (!emailRegex.test(value)) error = 'Invalid email format';
    }

    if (name === 'password') {
      if (!value) error = 'Password is required';
      else if (value.length < 6) error = 'Password must be at least 6 characters';
    }

    return error;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    const error = validate(name, value);
    setErrors({ ...errors, [name]: error });
    if (feedback.text) {
      setFeedback({ type: '', text: '' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const emailError = validate('email', form.email);
    const passwordError = validate('password', form.password);
    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }

    setFeedback({ type: '', text: '' });

    try {
      const res = await fetch(`${RESTAURANT_SERVICE_URL}/api/superAdmin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (res.ok) {
        const { token, name } = data; // Ensure 'name' comes from backend!
        setAuthToken(AUTH_ROLES.SUPER_ADMIN, token);
        localStorage.setItem('superAdminName', name);
        setFeedback({ type: 'success', text: 'Đăng nhập thành công! Đang chuyển hướng...' });
        navigate('/super-admin/dashboard');
      } else {
        setFeedback({ type: 'error', text: data.message || 'Không thể đăng nhập, vui lòng thử lại.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Đã xảy ra lỗi trong quá trình đăng nhập.' });
    }
  };

  return (
    <div className="sa-login-page">
      <div className="sa-login-card">
        <div className="sa-login-header">
          <span className="sa-login-icon">
            <FiShield />
          </span>
          <div>
            <h2>Super Admin</h2>
            <p>Đăng nhập để quản lý nhà hàng, tài xế và đơn hàng trên toàn hệ thống.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="sa-login-form" noValidate>
          <label className="sa-field">
            <span className="sa-field-label">
              <FiMail /> Email quản trị
            </span>
            <input
              type="email"
              name="email"
              placeholder="admin@domain.com"
              value={form.email}
              onChange={handleChange}
              className={errors.email ? 'has-error' : ''}
            />
            {errors.email && <span className="sa-error">{errors.email}</span>}
          </label>

          <label className="sa-field">
            <span className="sa-field-label">
              <FiLock /> Mật khẩu
            </span>
            <input
              type="password"
              name="password"
              placeholder="Nhập mật khẩu"
              value={form.password}
              onChange={handleChange}
              className={errors.password ? 'has-error' : ''}
            />
            {errors.password && <span className="sa-error">{errors.password}</span>}
          </label>

          {feedback.text && (
            <div className={`sa-feedback ${feedback.type}`}>{feedback.text}</div>
          )}

          <button type="submit" className="sa-submit">
            Đăng nhập
          </button>
        </form>
      </div>

      <aside className="sa-login-aside">
        <h3>Quyền quản trị toàn diện</h3>
        <p>
          Theo dõi trạng thái nhà hàng, điều phối tài xế và xử lý đơn hàng quan trọng một cách
          mượt mà.
        </p>
        <ul>
          <li>Giám sát hiệu suất theo thời gian thực</li>
          <li>Phê duyệt nhanh nhà hàng & tài xế</li>
          <li>Báo cáo thống kê chuyên sâu</li>
        </ul>
      </aside>
    </div>
  );
}

export default SuperAdminLogin;
