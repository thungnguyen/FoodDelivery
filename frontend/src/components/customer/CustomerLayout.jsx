import React, { useCallback, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaRegUserCircle,
  FaClipboardList,
  FaShoppingCart,
  FaSignOutAlt,
  FaUtensils,
} from "react-icons/fa";
import { CartContext } from "../../pages/contexts/CartContext";
import { clearAuthToken, AUTH_ROLES } from "../../utils/authTokens";

function CustomerLayout({ customerName = "Khách hàng thân thiết", children }) {
  const navigate = useNavigate();
  const { cartItems } = useContext(CartContext);

  const cartItemCount = useMemo(
    () => cartItems.reduce((count, item) => count + (item.quantity || 1), 0),
    [cartItems]
  );

  const handleLogout = useCallback(() => {
    clearAuthToken(AUTH_ROLES.CUSTOMER);
    localStorage.removeItem("pendingOrder");
    navigate("/");
  }, [navigate]);

  const handleNavigate = useCallback(
    (path) => {
      navigate(path);
    },
    [navigate]
  );

  const headerLinks = useMemo(
    () => [
      {
        label: "Trang chủ",
        icon: <FaUtensils size={16} color="#f8fafc" />,
        onClick: () => handleNavigate("/customer/home"),
      },
      {
        label: "Đơn hàng",
        icon: <FaClipboardList size={16} color="#f8fafc" />,
        onClick: () => handleNavigate("/customer/orders"),
      },
      {
        label: "Hồ sơ",
        icon: <FaRegUserCircle size={16} color="#f8fafc" />,
        onClick: () => handleNavigate("/customer/profile"),
      },
      {
        label: "Giỏ hàng",
        icon: <FaShoppingCart size={16} color="#f8fafc" />,
        onClick: () => handleNavigate("/customer/cart"),
        badge: cartItemCount > 0 ? cartItemCount : null,
      },
      {
        label: "Đăng xuất",
        icon: <FaSignOutAlt size={16} color="#f8fafc" />,
        onClick: handleLogout,
        danger: true,
      },
    ],
    [handleNavigate, cartItemCount, handleLogout]
  );

  const footerSections = useMemo(
    () => [
      {
        title: "Tài khoản",
        links: [
          { label: "Trang chủ khách hàng", action: () => handleNavigate("/customer/home") },
          { label: "Đơn hàng của tôi", action: () => handleNavigate("/customer/orders") },
          { label: "Giỏ hàng", action: () => handleNavigate("/customer/cart") },
          { label: "Hồ sơ cá nhân", action: () => handleNavigate("/customer/profile") },
        ],
      },
      {
        title: "Hỗ trợ",
        links: [
          { label: "Liên hệ & góp ý", action: () => handleNavigate("/contact") },
          { label: "Về chúng tôi", action: () => handleNavigate("/about") },
          { label: "Chính sách bảo mật", action: () => handleNavigate("/privacy") },
        ],
      },
      {
        title: "Kết nối nhanh",
        content: [
          "Hotline: 1900 6365",
          "Email: support@foodieflow.vn",
          "Giờ làm việc: 07:00 - 22:00",
        ],
      },
    ],
    [handleNavigate]
  );

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  return (
    <div
      style={{
        backgroundColor: "#f8f9ff",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #312e81 100%)",
          color: "#e2e8f0",
          padding: "16px 28px",
          boxShadow: "0 12px 30px rgba(15,23,42,0.25)",
          position: "sticky",
          top: 0,
          zIndex: 9,
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            display: "flex",
            gap: "24px",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #fb923c, #ef4444)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "16px",
                color: "#fff",
              }}
            >
              FF
            </div>
            <div>
              <p style={{ margin: 0, fontSize: "13px", letterSpacing: "0.08em", opacity: 0.75 }}>
                FoodieFlow Customer
              </p>
              <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: 600 }}>
                Xin chào, {customerName}!
              </h2>
            </div>
          </div>
          <nav
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {headerLinks.map(({ label, icon, onClick, badge, danger }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  borderRadius: "999px",
                  border: "none",
                  backgroundColor: danger ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.08)",
                  color: "#f8fafc",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "transform 0.2s ease, background-color 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.backgroundColor = danger
                    ? "rgba(239,68,68,0.28)"
                    : "rgba(255,255,255,0.18)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.backgroundColor = danger
                    ? "rgba(239,68,68,0.18)"
                    : "rgba(255,255,255,0.08)";
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {icon}
                </span>
                <span>{label}</span>
                {badge ? (
                  <span
                    style={{
                      minWidth: "18px",
                      height: "18px",
                      padding: "0 6px",
                      borderRadius: "999px",
                      backgroundColor: "#f87171",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        <div
          style={{
            padding: "36px 30px 40px",
            maxWidth: "1200px",
            margin: "0 auto",
            width: "100%",
          }}
        >
          {children}
        </div>
      </main>

      <footer
        style={{
          backgroundColor: "#0f172a",
          color: "#e2e8f0",
          padding: "42px 30px 24px",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "32px",
              marginBottom: "32px",
            }}
          >
            {footerSections.map((section) => (
              <div key={section.title}>
                <h4
                  style={{
                    marginBottom: "14px",
                    fontSize: "16px",
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                    color: "#f8fafc",
                  }}
                >
                  {section.title}
                </h4>
                {section.links ? (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                    {section.links.map(({ label, action }) => (
                      <li key={label}>
                        <button
                          type="button"
                          onClick={action}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#cbd5f5",
                            fontSize: "14px",
                            padding: 0,
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "color 0.2s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#ffe4e6";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#cbd5f5";
                          }}
                        >
                          {label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {section.content ? (
                  <div style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#cbd5f5" }}>
                    {section.content.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div
            style={{
              borderTop: "1px solid rgba(148,163,184,0.2)",
              paddingTop: "16px",
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              justifyContent: "space-between",
              fontSize: "13px",
              opacity: 0.8,
            }}
          >
            <span>© {currentYear} FoodieFlow. Tất cả các quyền được bảo lưu.</span>
            <span>Hãy tận hưởng hành trình ẩm thực của bạn cùng FoodieFlow.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default CustomerLayout;
