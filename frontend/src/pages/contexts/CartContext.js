import React, { createContext, useState, useContext } from "react";

// Create the CartContext
export const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);

  // Function to add item to cart
  const addToCart = (food) => {
    setCartItems((prevItems) => [...prevItems, food]);
  };

  // Function to remove item from cart
  const removeFromCart = (foodId) => {
    setCartItems((prevItems) => prevItems.filter(item => item._id !== foodId));
  };

  // Function to clear all items from cart
  const clearCart = () => {
    setCartItems([]);
  };

  return (
    <CartContext.Provider value={{ cartItems, addToCart, removeFromCart, clearCart }}>
      {children}
    </CartContext.Provider>
  );
};
