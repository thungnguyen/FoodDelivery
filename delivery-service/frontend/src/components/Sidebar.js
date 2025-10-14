import { Link, useNavigate } from "react-router-dom";
import React from "react";
import { motion } from "framer-motion";
import "../styles/sidebar.css";
import { getStoredDriverProfile } from "../utils/driverSession";

function Sidebar({ isOpen, onClose, isLoggedIn, onLogout }) {
  const navigate = useNavigate();
  const profile = getStoredDriverProfile();

  const closeSidebar = (e) => {
    if (e.target.className === "sidebar-overlay") {
      onClose();
    }
  };

  if (!isOpen) return null;

  const initials = (profile?.name || "TX")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="sidebar-overlay" onClick={closeSidebar}>
      <motion.div
        className="sidebar"
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        exit={{ x: -300 }}
        transition={{ duration: 0.5 }}
      >
        {isLoggedIn ? (
          <>
            <div className="sidebar-profile">
              <div className="profile-avatar">{initials}</div>
              <p className="profile-name">{profile?.name || "Tài xế"}</p>
              <button
                className="profile-link"
                onClick={() => {
                  navigate("/dashboard");
                  onClose();
                }}
              >
                Bảng điều khiển
              </button>
            </div>

            <div className="sidebar-links">
              <Link to="/dashboard" onClick={onClose}>
                Đơn đang giao
              </Link>
              <Link to="/driver-simulator" onClick={onClose}>
                Mô phỏng hành trình
              </Link>
              <Link to="/map-track/demo" onClick={onClose}>
                Theo dõi tuyến đường
              </Link>
            </div>

            <div className="sidebar-actions">
              <Link to="/driver-socket" onClick={onClose}>
                Trung tâm real-time
              </Link>
              <Link to="/delivery" onClick={onClose}>
                Tạo giao nhận thủ công
              </Link>
            </div>

            <button
              className="side_bar-signout-button"
              onClick={() => {
                onLogout();
                onClose();
              }}
            >
              Đăng xuất
            </button>
          </>
        ) : (
          <div className="sidebar-actions">
            <Link to="/login">
              <button className="side_bar-login-button" onClick={onClose}>
                Đăng nhập
              </button>
            </Link>
            <Link to="/register">
              <button className="side_bar-signup-button" onClick={onClose}>
                Đăng ký
              </button>
            </Link>
            <Link to="/driver-simulator" onClick={onClose}>
              Trải nghiệm thử
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default Sidebar;
