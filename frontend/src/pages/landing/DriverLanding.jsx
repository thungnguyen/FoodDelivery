import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import "../../styles/landing.css";

function DriverLanding() {
  useEffect(() => {
    // Auto redirect after 3 seconds
    const timer = setTimeout(() => {
      window.location.href = "http://localhost:3001";
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleRedirect = () => {
    window.location.href = "http://localhost:3001";
  };

  return (
    <div className="landing-container">
      <Header />

      <motion.div
        className="landing-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="landing-icon driver-icon">🚗</div>

        <h1 className="landing-title">Delivery Driver Portal</h1>

        <p className="landing-subtitle">
          Join our delivery team and earn money
        </p>

        <div className="landing-features">
          <div className="feature-item">
            <span className="feature-icon">📱</span>
            <span>Easy-to-use driver app</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🗺️</span>
            <span>Real-time navigation and tracking</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">💵</span>
            <span>Flexible hours and good earnings</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📊</span>
            <span>Track your deliveries and income</span>
          </div>
        </div>

        <div className="redirect-notice">
          <p>The Delivery Driver portal runs on a separate application.</p>
          <p className="redirect-timer">Redirecting to driver portal in 3 seconds...</p>
        </div>

        <div className="landing-actions">
          <motion.button
            className="landing-btn primary"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRedirect}
          >
            Go to Driver Portal Now
          </motion.button>
        </div>

        <div className="driver-info">
          <p>Driver Portal URL: <strong>http://localhost:3001</strong></p>
        </div>

        <Link to="/" className="back-link">
          ← Back to Home
        </Link>
      </motion.div>

      <Footer />
    </div>
  );
}

export default DriverLanding;
