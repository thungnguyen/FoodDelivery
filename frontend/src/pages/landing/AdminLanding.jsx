import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import "../../styles/landing.css";

function AdminLanding() {
  return (
    <div className="landing-container">
      <Header />

      <motion.div
        className="landing-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="landing-icon admin-icon">👨‍💼</div>

        <h1 className="landing-title">Super Admin Dashboard</h1>

        <p className="landing-subtitle">
          Manage and oversee the entire platform
        </p>

        <div className="landing-features">
          <div className="feature-item">
            <span className="feature-icon">🏪</span>
            <span>Manage all restaurants on platform</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">👥</span>
            <span>View and manage users</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📈</span>
            <span>Platform analytics and reports</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔧</span>
            <span>System configuration and settings</span>
          </div>
        </div>

        <div className="landing-actions">
          <Link to="/superadmin/login">
            <motion.button
              className="landing-btn primary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Login as Admin
            </motion.button>
          </Link>

          <Link to="/superadmin/register">
            <motion.button
              className="landing-btn secondary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Register Admin Account
            </motion.button>
          </Link>

          <Link to="/super-admin/drone-orders">
            <motion.button
              className="landing-btn secondary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Open Drone Control
            </motion.button>
          </Link>
        </div>

        <Link to="/" className="back-link">
          ← Back to Home
        </Link>
      </motion.div>

      <Footer />
    </div>
  );
}

export default AdminLanding;
