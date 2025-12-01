// src/App.js
import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// Contexts
import { CartProvider } from "./pages/contexts/CartContext"; // ✅ import CartProvider

// common components
import Home from "./pages/Home";
import About from "./pages/About";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ContactAndFeedback from "./pages/ContactAndFeedback";

// auth components
import AuthLogin from "./pages/auth/AuthLogin";
import AuthRegister from "./pages/auth/AuthRegister";
import CustomerProfile from "./pages/auth/CustomerProfile";

// payment management
import Checkout from "./pages/payment/CheckoutNew";

// order management
import OrderHome from "./pages/orderManagement/OrderHome";
import Orders from "./pages/orderManagement/Orders";
import DroneOrderMap from "./pages/orderManagement/DroneOrderMap";
import OrderForm from "./components/OrderForm";
import UpdateOrder from "./components/UpdateOrder";  // Import UpdateOrder page
import DeleteOrder from "./components/DeleteOrder";  // Import DeleteOrder page
import OrderDetails from "./components/OrderDetails";

// customer management
import CustomerHome from "./pages/customer/customerHome";
import RestaurentDetails from "./pages/customer/customerHome";
import FoodItemList from "./pages/customer/foodItemList";
import AddToCartPage from "./pages/customer/AddToCartPage";
import FoodDetailPage from "./pages/customer/FoodDetailPage";

// restaurant management
import SuperAdminRegister from './pages/restaurant/components/SuperAdminRegister';
import SuperAdminLogin from './pages/restaurant/components/SuperAdminLogin';
import SuperAdminDashboard from './pages/restaurant/pages/SuperAdminDashboard';
import SuperAdminDroneOrders from './pages/restaurant/pages/SuperAdminDroneOrders';
import RestaurantRegister from './pages/restaurant/components/RestaurantRegister';
import RestaurantLogin from './pages/restaurant/components/RestaurantLogin';
import RestaurantOnboardingVerify from './pages/restaurant/components/RestaurantOnboardingVerify';
import RestaurantOnboardingSetPassword from './pages/restaurant/components/RestaurantOnboardingSetPassword';
import RestaurantDashboard from './pages/restaurant/pages/RestaurantDashboard';
import IndexPage from './pages/restaurant/components/IndexPage';

// landing pages
import CustomerLanding from './pages/landing/CustomerLanding';
import RestaurantLanding from './pages/landing/RestaurantLanding';
import AdminLanding from './pages/landing/AdminLanding';
import DriverLanding from './pages/landing/DriverLanding';

// delivery management
import DroneCenterLayout from './pages/drone-center/DroneCenterLayout';
import Dashboard from './pages/drone-center/Dashboard';
import DronesPage from './pages/drone-center/DronesPage';
import HubsPage from './pages/drone-center/HubsPage';
import MapPage from './pages/drone-center/MapPage';
import SimulatorPage from './pages/drone-center/SimulatorPage';
import AssignPage from './pages/drone-center/AssignPage';
import MaintenancePage from './pages/drone-center/MaintenancePage';

function App() {
  const [orders, setOrders] = useState([]);

  const addOrder = (newOrder) => {
    setOrders((prevOrders) => [...prevOrders, newOrder]);
  };

  return (
    <CartProvider> {/* ✅ Wrap everything inside CartProvider */}
      <Router>
        <Routes>
          {/* common routes */}
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/contact" element={<ContactAndFeedback />} />

          {/* landing pages */}
          <Route path="/customer" element={<CustomerLanding />} />
          <Route path="/restaurant" element={<RestaurantLanding />} />
          <Route path="/admin" element={<AdminLanding />} />
          <Route path="/driver" element={<DriverLanding />} />

          {/* auth routes */}
          <Route path="/auth/login" element={<AuthLogin />} />
          <Route path="/auth/register" element={<AuthRegister />} />
          <Route path="/customer/profile" element={<CustomerProfile />} />

          {/* payment management */}
          <Route path="/checkout" element={<Checkout />} />

          {/* order management */}
          <Route path="/orders" element={<OrderHome orders={OrderHome} />} />
          <Route path="/orders/new" element={<OrderForm addOrder={addOrder} />} />
          <Route path="/orders/edit/:id" element={<UpdateOrder addOrder={addOrder} />} />
          <Route path="/orders/delete/:id" element={<DeleteOrder />} />
          <Route path="/orders/details/:id" element={<OrderDetails />} />

          {/* customer dashboard */}
          <Route path="/customer/home" element={<CustomerHome />} />
          <Route path="/customer/restaurant/:id" element={<RestaurentDetails />} />
          <Route path="/customer/restaurant/:restaurantId/foods" element={<FoodItemList />} />
          <Route path="/customer/restaurant/:restaurantId/foods/:foodId" element={<FoodDetailPage />} />
          <Route path="/customer/cart" element={<AddToCartPage />} />
          <Route path="/customer/orders" element={<Orders />} />
          <Route path="/customer/drone-map/:id" element={<DroneOrderMap />} />

          {/* restaurant management */}
          <Route path="/superadmin/register" element={<SuperAdminRegister />} />
          <Route path="/superadmin/login" element={<SuperAdminLogin />} />
          <Route path="/superadmin/dashboard" element={<SuperAdminDashboard />} />
          <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
          <Route path="/super-admin/drone-orders" element={<SuperAdminDroneOrders />} />
          <Route path="/restaurant/register" element={<RestaurantRegister />} />
          <Route path="/restaurant/login" element={<RestaurantLogin />} />
          <Route path="/restaurant/activate" element={<RestaurantOnboardingVerify />} />
          <Route
            path="/restaurant/activate/change-password"
            element={<RestaurantOnboardingSetPassword />}
          />
          <Route path="/restaurant/dashboard" element={<RestaurantDashboard />} />
          <Route path="/restaurant/home" element={<IndexPage />} />

          {/* delivery management */}
          <Route path="/drone-center/*" element={<DroneCenterLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="drones" element={<DronesPage />} />
            <Route path="hubs" element={<HubsPage />} />
            <Route path="assign" element={<AssignPage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="simulator" element={<SimulatorPage />} />
          </Route>

        </Routes>
      </Router>
    </CartProvider>

    //     <Router>
    //       <Routes>
    //         // common routes
    //         <Route path="/" element={<Home />} />
    //         <Route path="/about" element={<About />} />
    //         <Route path="/privacy" element={<PrivacyPolicy />} />
    //         <Route path="/contact" element={<ContactAndFeedback />} />

    //         // auth routes
    //         <Route path="/auth/login" element={<AuthLogin />} />
    // +       <Route path="/auth/register" element={<AuthRegister />} />
    //         <Route path="/customer/profile" element={<CustomerProfile />} />

    //         // payment management
    //         <Route path="/checkout" element={<Checkout />} />

    //         // order management
    //         <Route path="/orders" element={<OrderHome orders={OrderHome} />} />
    //         <Route path="/orders/new" element={<OrderForm addOrder={addOrder} />} />
    //         <Route path="/orders/edit/:id" element={<UpdateOrder addOrder={addOrder} />} />
    //         <Route path="/orders/delete/:id" element={<DeleteOrder />} />
    //         <Route path="/orders/details/:id" element={<OrderDetails />} />

    //         // restaurant management
    //         <Route path="/superadmin/register" element={<SuperAdminRegister />} />
    //         <Route path="/superadmin/login" element={<SuperAdminLogin />} />
    //         <Route path="/superadmin/dashboard" element={<SuperAdminDashboard />} />
    //         <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
    //         <Route path="/restaurant/register" element={<RestaurantRegister />} />
    //         <Route path="/restaurant/login" element={<RestaurantLogin />} />
    //         <Route path="/restaurant/dashboard" element={<RestaurantDashboard />} />
    //         <Route path="/restaurant/home" element={<IndexPage />} />

    //         // delivery management

    //       </Routes>
    //     </Router>
  );
}

export default App;
