import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import "../../styles/landing.css";

function CustomerLanding() {
  return (
    <div className="landing-container">
      <Header />

      <motion.div
        className="landing-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="landing-icon customer-icon">🍔</div>

        <h1 className="landing-title">Welcome Customer!</h1>

        <p className="landing-subtitle">
          Order delicious food from your favorite restaurants
        </p>

        <div className="landing-features">
          <div className="feature-item">
            <span className="feature-icon">🔍</span>
            <span>Browse hundreds of restaurants</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🛒</span>
            <span>Easy ordering with cart system</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📦</span>
            <span>Real-time order tracking</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">💳</span>
            <span>Secure online payment</span>
          </div>
        </div>

        <div className="landing-actions">
          <Link to="/auth/login">
            <motion.button
              className="landing-btn primary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Login as Customer
            </motion.button>
          </Link>

          <Link to="/auth/register">
            <motion.button
              className="landing-btn secondary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Register New Account
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

export default CustomerLanding;
