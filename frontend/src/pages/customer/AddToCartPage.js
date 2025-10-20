import React, { useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CartContext } from "../contexts/CartContext";
import { FaArrowLeft } from "react-icons/fa";

function AddToCartPage() {
  const { cartItems, removeFromCart, updateQuantity, changeQuantityBy } = useContext(CartContext);
  const navigate = useNavigate();

  const handleProceed = () => {
    navigate("/orders/new");
  };

  const handleBackToFoodList = () => {
    navigate("/customer/home");
  };

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (total, item) => total + (item.price || 0) * (item.quantity || 1),
        0
      ),
    [cartItems]
  );

  return (
    <div
      style={{
        padding: "30px",
        backgroundColor: "#f0f2f5",
        minHeight: "100vh",
        position: "relative",
      }}
    >
      {/* Back Arrow Icon Button */}
      <div style={{ marginBottom: "20px" }}>
        <button
          onClick={handleBackToFoodList}
          style={{
            backgroundColor: "transparent",
            border: "none",
            color: "#333",
            fontSize: "28px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <FaArrowLeft />
        </button>
      </div>

      <h2
        style={{
          fontSize: "36px",
          fontWeight: "700",
          marginBottom: "30px",
          textAlign: "center",
          color: "#222",
          background: "linear-gradient(90deg, #f8f8f8, #e0e0e0)",
          padding: "15px 20px",
          borderRadius: "12px",
          boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
          letterSpacing: "1px",
          position: "relative",
        }}
      >
        🛒 Your Shopping Cart
        <div
          style={{
            height: "4px",
            width: "80px",
            backgroundColor: "#ff7f50",
            margin: "10px auto 0",
            borderRadius: "2px",
          }}
        ></div>
      </h2>

      {cartItems.length === 0 ? (
        <p style={{ textAlign: "center", fontSize: "18px", color: "#555" }}>
          Your cart is currently empty. Start adding some delicious items! 🍔🍟
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "25px",
            justifyContent: "center",
          }}
        >
          {cartItems.map((item, index) => (
            <div
              key={index}
              style={{
                width: "300px",
                backgroundColor: "#fff",
                borderRadius: "12px",
                boxShadow: "0 6px 16px rgba(0, 0, 0, 0.1)",
                overflow: "hidden",
                position: "relative",
                transition: "transform 0.3s, box-shadow 0.3s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-8px)";
                e.currentTarget.style.boxShadow =
                  "0 8px 20px rgba(0, 0, 0, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 6px 16px rgba(0, 0, 0, 0.1)";
              }}
            >
              <img
                src={
                  item.image || "https://placehold.co/300x200?text=Food+Image"
                }
                alt={item.name}
                style={{
                  width: "100%",
                  height: "180px",
                  objectFit: "cover",
                }}
              />
              <div style={{ padding: "16px" }}>
                <h5
                  style={{
                    fontSize: "20px",
                    fontWeight: "600",
                    marginBottom: "8px",
                  }}
                >
                  {item.name}
                </h5>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    marginBottom: "10px",
                  }}
                >
                  {item.description}
                </p>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    marginBottom: "10px",
                  }}
                >
                  {item.quantity || 1} x {item.price} VND
                </p>
                <p style={{ fontSize: "18px", fontWeight: "bold", color: "#333", marginBottom: "12px" }}>
                   {(item.price || 0) * (item.quantity || 1)} VND
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    onClick={() => changeQuantityBy(item._id, -1)}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      border: "1px solid #ccc",
                      backgroundColor: "#fff",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                    disabled={(item.quantity || 1) <= 1}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity || 1}
                    onChange={(e) => updateQuantity(item._id, e.target.value)}
                    style={{
                      width: "60px",
                      textAlign: "center",
                      padding: "6px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                    }}
                  />
                  <button
                    onClick={() => changeQuantityBy(item._id, 1)}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      border: "1px solid #ccc",
                      backgroundColor: "#fff",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    +
                  </button>
                </div>
                <p style={{ fontSize: "13px", color: "#999" }}>
                  Category: {item.category}
                </p>
              </div>

              {/* Thin Orange Remove Button */}
              <div
                title="Remove from cart"
                onClick={() => removeFromCart(item._id)}
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  fontSize: "22px",
                  fontWeight: "400",
                  color: "orange",
                  cursor: "pointer",
                  border: "2px solid black",
                  borderRadius: "50%",
                  padding: "4px 8px",
                  backgroundColor: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "34px",
                  height: "34px",
                  transition: "background-color 0.3s, transform 0.3s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffe8d6";
                  e.currentTarget.style.transform = "scale(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#fff";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                ×
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 👉 Bottom-right Button */}
      {cartItems.length > 0 && (
        <>
          <div
            style={{
              position: "fixed",
              bottom: "30px",
              right: "200px",
              backgroundColor: "#fff",
              padding: "14px 24px",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              fontWeight: "600",
              fontSize: "16px",
            }}
          >
            Total: Rs. {cartTotal}
          </div>
          <button
            onClick={handleProceed}
            style={{
              position: "fixed",
              bottom: "30px",
              right: "30px",
              backgroundColor: "#ff7f50",
              color: "white",
              padding: "14px 24px",
              borderRadius: "8px",
              border: "none",
              fontSize: "16px",
              fontWeight: "600",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              transition: "background-color 0.3s, transform 0.3s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#ff5722";
              e.currentTarget.style.transform = "scale(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#ff7f50";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Proceed to Order 🛒
          </button>
        </>
      )}
    </div>
  );
}

export default AddToCartPage;
