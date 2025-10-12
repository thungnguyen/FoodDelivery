import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Header from "../components/Header";
import Footer from "../components/Footer";
import "../styles/home.css";
import "../styles/driver-home.css";

function Home() {
  return (
    <div className="home-container">
      <Header />

      <main className="home-main">
        {/* Hero Section for Drivers */}
        <motion.div
          className="hero-section driver-hero"
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="driver-icon-large">🚗</div>
          <h1 className="hero-title">Welcome to Driver Portal</h1>
          <p className="hero-subtitle">Join our delivery team and start earning today</p>
          <div className="hero-buttons">
            <Link to="/login">
              <motion.button
                className="hero-button primary"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Login as Driver
              </motion.button>
            </Link>
            <Link to="/register">
              <motion.button
                className="hero-button secondary"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Register Now
              </motion.button>
            </Link>
          </div>
        </motion.div>

        {/* Driver Benefits Section */}
        <section className="driver-benefits">
          <h2>Why Join Our Driver Team?</h2>
          <div className="benefits-grid">
            <motion.div
              className="benefit-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="benefit-icon">💵</div>
              <h3>Earn Good Money</h3>
              <p>Flexible hours with competitive pay. Earn more during peak hours</p>
            </motion.div>

            <motion.div
              className="benefit-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="benefit-icon">⏰</div>
              <h3>Flexible Schedule</h3>
              <p>Work when you want. Be your own boss and set your hours</p>
            </motion.div>

            <motion.div
              className="benefit-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="benefit-icon">📱</div>
              <h3>Easy-to-Use App</h3>
              <p>Simple interface with GPS navigation and real-time updates</p>
            </motion.div>

            <motion.div
              className="benefit-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="benefit-icon">🎯</div>
              <h3>Track Your Earnings</h3>
              <p>Monitor your deliveries and income in real-time</p>
            </motion.div>
          </div>
        </section>

        {/* How It Works for Drivers */}
        <section className="how-it-works driver-how">
          <h2>How Delivery Works</h2>
          <div className="driver-steps">
            {[
              { title: 'Get Online', desc: 'Open the app and start accepting delivery requests', icon: '📱' },
              { title: 'Pick Up Order', desc: 'Navigate to restaurant and collect the order', icon: '🏪' },
              { title: 'Deliver', desc: 'Use GPS to deliver to customer location', icon: '🚗' },
              { title: 'Get Paid', desc: 'Earn money instantly after each delivery', icon: '💰' }
            ].map((step, index) => (
              <motion.div
                key={index}
                className="driver-step"
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="step-number">{index + 1}</div>
                <div className="step-icon-big">{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="driver-cta">
          <motion.div
            className="cta-content"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2>Ready to Start Earning?</h2>
            <p>Join thousands of drivers already making money with us</p>
            <Link to="/register">
              <motion.button
                className="cta-button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Sign Up Now - It's Free!
              </motion.button>
            </Link>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default Home;
