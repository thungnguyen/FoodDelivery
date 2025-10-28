// src/components/RestaurantRegister.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMail, FiMapPin, FiUser, FiPhone, FiFileText, FiCheckCircle } from 'react-icons/fi';
import '../styles/restaurantRegister.css';
import { RESTAURANT_SERVICE_URL } from '../../../utils/serviceUrls';

const initialFormState = {
  name: '',
  taxCode: '',
  ownerName: '',
  location: '',
  contactNumber: '',
  profilePicture: null,
  email: '',
};

function RestaurantRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialFormState);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({
    name: '',
    taxCode: '',
    ownerName: '',
    location: '',
    contactNumber: '',
    email: '',
  });

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({ ...prev, [name]: value }));

    if (name !== 'profilePicture') {
      validate(name, value);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setForm((prev) => ({ ...prev, profilePicture: file || null }));
  };

  // Restrict contact number to only numbers and limit to 10 digits
  const handleContactNumberChange = (e) => {
    const { value } = e.target;
    // Allow only numbers and limit to 10 digits
    if (/^\d{0,10}$/.test(value)) {
      setForm((prev) => ({ ...prev, contactNumber: value }));
      validate('contactNumber', value);
    }
  };

  // Real-time field validation
  const validate = (name, value) => {
    const errorsCopy = { ...errors };
    const trimmedValue = typeof value === 'string' ? value.trim() : value;

    switch (name) {
      case 'name':
        errorsCopy.name = trimmedValue ? '' : 'Restaurant name is required';
        break;
      case 'taxCode': {
        const taxCodeRegex = /^\d{10}(\d{3})?$/;
        errorsCopy.taxCode = taxCodeRegex.test(trimmedValue)
          ? ''
          : 'Tax code must be 10 or 13 digits';
        break;
      }
      case 'ownerName':
        errorsCopy.ownerName = trimmedValue ? '' : 'Owner name is required';
        break;
      case 'location':
        errorsCopy.location = trimmedValue ? '' : 'Location is required';
        break;
      case 'contactNumber':
        const phoneRegex = /^[0-9]{10}$/;
        errorsCopy.contactNumber =
          phoneRegex.test(trimmedValue) ? '' : 'Phone number must be exactly 10 digits';
        break;
      case 'email':
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        errorsCopy.email = emailRegex.test(trimmedValue)
          ? ''
          : 'Please enter a valid email address';
        break;
      default:
        break;
    }

    setErrors(errorsCopy);
  };

  // Check if the form is valid
  const validateForm = () => {
    const requiredFields = ['name', 'taxCode', 'ownerName', 'location', 'contactNumber', 'email'];
    const hasEmpties = requiredFields.some((field) => {
      const value = form[field];
      return typeof value !== 'string' || value.trim() === '';
    });
    return (
      !hasEmpties &&
      Object.values(errors).every((err) => err === '')
    );
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      setFeedback({
        type: 'error',
        text: 'Vui lòng kiểm tra lại thông tin. Các trường bắt buộc không được để trống.',
      });
      return;
    }

    setFeedback({ type: '', text: '' });
    setIsSubmitting(true);

    const emailForActivation = form.email.trim();

    try {
      const formData = new FormData();
      formData.append('name', form.name.trim());
      formData.append('ownerName', form.ownerName.trim());
      formData.append('taxCode', form.taxCode.trim());
      formData.append('location', form.location.trim());
      formData.append('contactNumber', form.contactNumber.trim());
      if (form.profilePicture) {
        formData.append('profilePicture', form.profilePicture);
      }
      formData.append('email', emailForActivation);

      const res = await fetch(`${RESTAURANT_SERVICE_URL}/api/restaurants/register`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setFeedback({
          type: 'success',
          text:
          data.message ||
            'Đăng ký thành công! Hồ sơ đang chờ Super Admin duyệt. Vui lòng kiểm tra email để nhận thông báo tiếp theo.',
        });
        setForm(initialFormState);
        setTimeout(() => {
          navigate(
            `/restaurant/activate?email=${encodeURIComponent(emailForActivation)}`,
            { replace: true }
          );
        }, 1000);
      } else {
        setFeedback({ type: 'error', text: data.message || 'Registration failed' });
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        text: 'Không thể đăng ký nhà hàng. Vui lòng thử lại sau.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="restaurant-register-wrapper">
      <div className="register-card">
        <div className="register-card__aside">
          <h1>Trở thành đối tác nhà hàng</h1>
          <p>
            Điền thông tin cơ bản, đội ngũ Super Admin sẽ duyệt hồ sơ, gửi mật khẩu tạm thời và
            mã OTP để bạn kích hoạt tài khoản.
          </p>
          <ul className="register-steps">
            <li>
              <FiFileText /> Hoàn tất biểu mẫu đăng ký trực tuyến.
            </li>
            <li>
              <FiCheckCircle /> Super Admin duyệt hồ sơ trong giờ hành chính.
            </li>
            <li>
              <FiMail /> Nhận OTP qua email và kích hoạt tài khoản trong 5 phút.
            </li>
          </ul>
        </div>

        <div className="register-card__body">
          <h2>Thông tin nhà hàng</h2>
          <p className="section-helper">
            Các thông tin này dùng để xác thực và tạo tài khoản quản trị nhà hàng của bạn.
          </p>
          <form onSubmit={handleSubmit} encType="multipart/form-data" className="register-form">
            <div className="form-grid">
              <label className="input-wrapper">
                <span className="input-label">
                  <FiFileText /> Tên nhà hàng *
                </span>
                <input
                  type="text"
                  name="name"
                  placeholder="VD: Nhà hàng Xanh"
                  value={form.name}
                  onChange={handleChange}
                  className={errors.name ? 'has-error' : ''}
                />
                {errors.name && <span className="error-text">{errors.name}</span>}
              </label>

              <label className="input-wrapper">
                <span className="input-label">
                  <FiFileText /> Mã số thuế *
                </span>
                <input
                  type="text"
                  name="taxCode"
                  placeholder="10 hoặc 13 số"
                  value={form.taxCode}
                  onChange={handleChange}
                  className={errors.taxCode ? 'has-error' : ''}
                />
                {errors.taxCode && <span className="error-text">{errors.taxCode}</span>}
              </label>

              <label className="input-wrapper">
                <span className="input-label">
                  <FiUser /> Chủ sở hữu *
                </span>
                <input
                  type="text"
                  name="ownerName"
                  placeholder="Họ và tên chủ sở hữu"
                  value={form.ownerName}
                  onChange={handleChange}
                  className={errors.ownerName ? 'has-error' : ''}
                />
                {errors.ownerName && <span className="error-text">{errors.ownerName}</span>}
              </label>

              <label className="input-wrapper">
                <span className="input-label">
                  <FiMapPin /> Địa điểm *
                </span>
                <input
                  type="text"
                  name="location"
                  placeholder="Số nhà, phường/xã, quận/huyện, tỉnh/thành"
                  value={form.location}
                  onChange={handleChange}
                  className={errors.location ? 'has-error' : ''}
                />
                {errors.location && <span className="error-text">{errors.location}</span>}
              </label>

              <label className="input-wrapper">
                <span className="input-label">
                  <FiPhone /> Số liên hệ *
                </span>
                <input
                  type="text"
                  name="contactNumber"
                  placeholder="0978123456"
                  value={form.contactNumber}
                  onChange={handleContactNumberChange}
                  className={errors.contactNumber ? 'has-error' : ''}
                  inputMode="numeric"
                />
                {errors.contactNumber && <span className="error-text">{errors.contactNumber}</span>}
              </label>

              <label className="input-wrapper">
                <span className="input-label">
                  <FiMail /> Email quản trị *
                </span>
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
            </div>

            <label className="file-input-wrapper" htmlFor="profilePicture">
              <span className="input-label">Ảnh đại diện (tùy chọn)</span>
              <div className="file-drop">
                <span>{form.profilePicture ? form.profilePicture.name : 'Chọn hoặc kéo thả hình ảnh'}</span>
                <input
                  type="file"
                  name="profilePicture"
                  accept="image/*"
                  id="profilePicture"
                  onChange={handleFileChange}
                />
              </div>
            </label>

            {feedback.text && (
              <div className={`form-alert ${feedback.type}`}>
                {feedback.text}
              </div>
            )}

            <button type="submit" disabled={!validateForm() || isSubmitting}>
              {isSubmitting ? 'Đang gửi...' : 'Gửi hồ sơ đăng ký'}
            </button>

            <p className="post-submit-hint">
              Sau khi gửi thành công bạn sẽ được chuyển tới trang kích hoạt tài khoản để nhập OTP.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default RestaurantRegister;
