import React, { createContext, useState, useContext } from "react";

// Create the CartContext
export const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);

  // Function to add item to cart
  const addToCart = (food) => {
    setCartItems((prevItems) => {
      const existing = prevItems.find((item) => item._id === food._id);
      if (existing) {
        return prevItems.map((item) =>
          item._id === food._id
            ? { ...item, quantity: (item.quantity || 1) + 1 }
            : item
        );
      }
      return [...prevItems, { ...food, quantity: 1 }];
    });
  };

  // Function to remove item from cart
  const removeFromCart = (foodId) => {
    setCartItems((prevItems) => prevItems.filter(item => item._id !== foodId));
  };

  const updateQuantity = (foodId, quantity) => {
    const normalizedQuantity = Math.max(1, parseInt(quantity, 10) || 1);
    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item._id === foodId ? { ...item, quantity: normalizedQuantity } : item
      )
    );
  };

  const changeQuantityBy = (foodId, delta) => {
    setCartItems((prevItems) =>
      prevItems
        .map((item) => {
          if (item._id !== foodId) return item;
          const nextQuantity = (item.quantity || 1) + delta;
          if (nextQuantity <= 0) {
            return null;
          }
          return { ...item, quantity: nextQuantity };
        })
        .filter(Boolean)
    );
  };

  // Function to clear all items from cart
  const clearCart = () => {
    setCartItems([]);
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        clearCart,
        updateQuantity,
        changeQuantityBy,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
