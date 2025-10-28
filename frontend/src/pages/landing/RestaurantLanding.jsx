import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import "../../styles/landing.css";

function RestaurantLanding() {
  return (
    <div className="landing-container">
      <Header />

      <motion.div
        className="landing-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="landing-icon restaurant-icon">🍽️</div>

        <h1 className="landing-title">Restaurant Partner Portal</h1>

        <p className="landing-subtitle">
          Manage your restaurant and grow your business
        </p>

        <div className="landing-features">
          <div className="feature-item">
            <span className="feature-icon">📋</span>
            <span>Manage your menu and food items</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📊</span>
            <span>View and update orders in real-time</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">💰</span>
            <span>Track sales and revenue</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">⚙️</span>
            <span>Update restaurant profile and settings</span>
          </div>
        </div>

        <div className="landing-actions">
          <Link to="/restaurant/login">
            <motion.button
              className="landing-btn primary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Login as Restaurant
            </motion.button>
          </Link>

          <Link to="/restaurant/register">
            <motion.button
              className="landing-btn secondary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Register Your Restaurant
            </motion.button>
          </Link>

          <Link to="/restaurant/activate">
            <motion.button
              className="landing-btn tertiary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Activate With OTP
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

export default RestaurantLanding;
