import React, { useState, useEffect, useCallback, useMemo } from 'react';
import '../styles/rdashboard.css';
import { RESTAURANT_SERVICE_URL, ORDER_SERVICE_URL } from '../../../utils/serviceUrls';
import { getAuthToken, clearAuthToken, AUTH_ROLES } from '../../../utils/authTokens';

const ORDER_STATUS_LABELS = {
  'Pending Confirmation': 'Chờ xác nhận',
  Confirmed: 'Đã xác nhận',
  Preparing: 'Đang chuẩn bị',
  'Awaiting Driver': 'Chờ tài xế',
  'Out for Delivery': 'Đang giao hàng',
  Delivered: 'Đã giao hàng',
  Completed: 'Đã hoàn thành',
  Cancelled: 'Đã hủy',
  Failed: 'Thất bại / Không giao được',
  Refunded: 'Đã hoàn tiền',
  // Backward compatibility
  Pending: 'Chờ xác nhận',
  Canceled: 'Đã hủy',
  'Ready for Delivery': 'Chờ tài xế',
};

const ORDER_STATUS_ACTIONS = {
  'Pending Confirmation': { nextStatus: 'Confirmed', label: 'Xác nhận đơn' },
  Confirmed: { nextStatus: 'Preparing', label: 'Bắt đầu chuẩn bị' },
  Preparing: { nextStatus: 'Awaiting Driver', label: 'Hoàn tất chế biến' },
  Pending: { nextStatus: 'Confirmed', label: 'Xác nhận đơn' },
};

const ORDER_CANCELABLE_STATUSES = new Set([
  'Pending Confirmation',
  'Confirmed',
  'Preparing',
  'Awaiting Driver',
  'Pending', // backward compatibility
]);

const ORDER_STATUS_CLASSES = {
  'Pending Confirmation': 'status-pending',
  Confirmed: 'status-confirmed',
  Preparing: 'status-preparing',
  'Awaiting Driver': 'status-ready',
  'Out for Delivery': 'status-out',
  Delivered: 'status-delivered',
  Completed: 'status-completed',
  Cancelled: 'status-canceled',
  Failed: 'status-failed',
  Refunded: 'status-refunded',
  // Backward compatibility
  Pending: 'status-pending',
  'Ready for Delivery': 'status-ready',
  Canceled: 'status-canceled',
};

function RestaurantDashboard() {
  const [activeTab, setActiveTab] = useState('profile');
  const [restaurant, setRestaurant] = useState({});
  const [foodItems, setFoodItems] = useState([]);
  const [availability, setAvailability] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [newFoodItem, setNewFoodItem] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    imageUrl: '',
  });
  const [editFoodItem, setEditFoodItem] = useState(null); // For editing food items
  const [editProfile, setEditProfile] = useState(false); // For editing profile
  const [editableProfile, setEditableProfile] = useState(null); // For editable profile data
  const API_BASE = RESTAURANT_SERVICE_URL;
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const ORDER_API_BASE = ORDER_SERVICE_URL;

  const handleLogout = () => {
    clearAuthToken(AUTH_ROLES.RESTAURANT);
    window.location.href = '/restaurant/homes';
  };

  const handleUnauthorizedError = useCallback(() => {
    alert('Your session has expired. Please log in again.');
    clearAuthToken(AUTH_ROLES.RESTAURANT);
    window.location.href = '/restaurant/login';
  }, []);

  const fetchRestaurantProfile = useCallback(async () => {
    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const res = await fetch(`${API_BASE}/api/restaurants/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        handleUnauthorizedError();
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setRestaurant(data);
        setAvailability(data.availability);
      } else {
        alert(data.message || 'Failed to fetch profile');
      }
    } catch (err) {
      alert('Error fetching profile');
    }
  }, [API_BASE, handleUnauthorizedError]);

  const fetchFoodItems = useCallback(async () => {
    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const res = await fetch(`${API_BASE}/api/food-items/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        handleUnauthorizedError();
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setFoodItems(data);
      } else {
        alert(data.message || 'Failed to fetch food items');
      }
    } catch (err) {
      console.error('Error fetching food items:', err);
    }
  }, [API_BASE, handleUnauthorizedError]);

  const fetchOrders = useCallback(async () => {
    try {
      setOrdersLoading(true);
      setOrdersError('');
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const res = await fetch(`${ORDER_API_BASE}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        handleUnauthorizedError();
        return;
      }
      const data = await res.json();
      if (res.ok) {
        const sortedOrders = Array.isArray(data)
          ? [...data].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
          : [];
        setOrders(sortedOrders);
      } else {
        setOrdersError(data.message || 'Không thể tải danh sách đơn hàng.');
      }
    } catch (err) {
      setOrdersError('Có lỗi khi tải danh sách đơn hàng.');
    } finally {
      setOrdersLoading(false);
    }
  }, [ORDER_API_BASE, handleUnauthorizedError]);

  const updateOrderStatus = async (orderId, status, successMessage) => {
    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const res = await fetch(`${ORDER_API_BASE}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        handleUnauthorizedError();
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setOrders((prev) =>
          prev.map((order) => (order._id === data._id ? data : order))
        );
        if (successMessage) {
          alert(successMessage);
        }
      } else {
        alert(data.message || 'Không thể cập nhật trạng thái đơn hàng.');
      }
    } catch (err) {
      alert('Có lỗi khi cập nhật trạng thái đơn hàng.');
    }
  };

  const handleAdvanceOrderStatus = (order) => {
    const action = ORDER_STATUS_ACTIONS[order.status];
    if (!action) {
      return;
    }
    const nextLabel = ORDER_STATUS_LABELS[action.nextStatus] || action.nextStatus;
    updateOrderStatus(order._id, action.nextStatus, `Đã chuyển trạng thái sang ${nextLabel}.`);
  };

  const handleCancelOrder = (order) => {
    if (!ORDER_CANCELABLE_STATUSES.has(order.status)) {
      return;
    }
    const confirmCancel = window.confirm('Bạn có chắc chắn muốn hủy đơn hàng này?');
    if (!confirmCancel) {
      return;
    }
    updateOrderStatus(order._id, 'Cancelled', 'Đơn hàng đã được hủy.');
  };

  const formatCurrency = (value) => {
    const amount = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(amount)) {
      return value;
    }
    return amount.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
  };

  const formatNumber = (value) => {
    const number = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(number)) {
      return value;
    }
    return number.toLocaleString('vi-VN');
  };

  const financialMetrics = useMemo(() => {
    if (!orders.length) {
      return {
        deliveredOrders: [],
        totalRevenue: 0,
        dailyRevenue: 0,
        monthlyRevenue: 0,
        yearlyRevenue: 0,
        deliveredCount: 0,
        cancelledCount: 0,
        failedCount: 0,
        averageOrderValue: 0,
        dailyOrders: 0,
        monthlyOrders: 0,
        yearlyOrders: 0,
        pendingRevenue: 0,
        pendingOrders: 0,
        revenueTrend: [],
        topItems: [],
        paymentBreakdown: {
          cash: 0,
          card: 0,
          other: 0,
        },
      };
    }

    const parseAmount = (order) =>
      Number(
        order.totalPrice ??
          order.total ??
          order.grandTotal ??
          order.amount ??
          order.totalAmount ??
          0
      );

    const resolveDate = (order) => {
      const candidate =
        order.deliveredAt ||
        order.completedAt ||
        order.updatedAt ||
        order.createdAt ||
        order.created_at;
      const date = candidate ? new Date(candidate) : new Date();
      if (Number.isNaN(date.getTime())) {
        return new Date();
      }
      return date;
    };

    const deliveredOrders = orders.filter((order) =>
      ['Delivered', 'Completed'].includes(order.status)
    );
    const cancelledCount = orders.filter((order) => order.status === 'Cancelled').length;
    const failedCount = orders.filter((order) => order.status === 'Failed').length;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let totalRevenue = 0;
    let dailyRevenue = 0;
    let monthlyRevenue = 0;
    let yearlyRevenue = 0;
    let dailyOrders = 0;
    let monthlyOrders = 0;
    let yearlyOrders = 0;

    const revenueTrendMap = new Map();
    const itemSalesMap = new Map();
    const paymentBreakdown = { cash: 0, card: 0, other: 0 };

    deliveredOrders.forEach((order) => {
      const amount = parseAmount(order);
      totalRevenue += amount;

      const orderDate = resolveDate(order);
      if (orderDate >= startOfToday) {
        dailyRevenue += amount;
        dailyOrders += 1;
      }
      if (orderDate >= startOfMonth) {
        monthlyRevenue += amount;
        monthlyOrders += 1;
      }
      if (orderDate >= startOfYear) {
        yearlyRevenue += amount;
        yearlyOrders += 1;
      }

      const dateKey = orderDate.toISOString().slice(0, 10);
      const existing = revenueTrendMap.get(dateKey) || { revenue: 0, orders: 0, date: orderDate };
      existing.revenue += amount;
      existing.orders += 1;
      revenueTrendMap.set(dateKey, existing);

      const paymentMethod = (order.paymentMethod || order.payment?.method || 'cash').toLowerCase();
      if (paymentMethod === 'card') {
        paymentBreakdown.card += amount;
      } else if (paymentMethod === 'cash') {
        paymentBreakdown.cash += amount;
      } else {
        paymentBreakdown.other += amount;
      }

      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const key = item.foodId || item.foodName || item.name;
          if (!key) return;
          const existingItem = itemSalesMap.get(key) || {
            name: item.foodName || item.name || 'Món',
            quantity: 0,
            revenue: 0,
          };
          const qty = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          existingItem.quantity += qty;
          existingItem.revenue += qty * price;
          itemSalesMap.set(key, existingItem);
        });
      }
    });

    const deliveredCount = deliveredOrders.length;
    const averageOrderValue = deliveredCount ? totalRevenue / deliveredCount : 0;

    const revenueTrend = Array.from(revenueTrendMap.entries())
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .slice(-7)
      .map(([dateKey, info]) => ({
        dateKey,
        dateLabel: new Date(dateKey).toLocaleDateString('vi-VN'),
        revenue: info.revenue,
        orders: info.orders,
      }));

    const topItems = Array.from(itemSalesMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const pendingStatuses = new Set([
      'Pending Confirmation',
      'Pending',
      'Confirmed',
      'Preparing',
      'Awaiting Driver',
      'Out for Delivery',
    ]);

    const pendingOrdersList = orders.filter((order) => pendingStatuses.has(order.status));
    const pendingRevenue = pendingOrdersList.reduce((sum, order) => sum + parseAmount(order), 0);

    return {
      deliveredOrders,
      totalRevenue,
      dailyRevenue,
      monthlyRevenue,
      yearlyRevenue,
      deliveredCount,
      cancelledCount,
      failedCount,
      averageOrderValue,
      dailyOrders,
      monthlyOrders,
      yearlyOrders,
      pendingRevenue,
      pendingOrders: pendingOrdersList.length,
      revenueTrend,
      topItems,
      paymentBreakdown,
    };
  }, [orders]);
  const {
    deliveredOrders,
    totalRevenue,
    dailyRevenue,
    monthlyRevenue,
    yearlyRevenue,
    deliveredCount,
    cancelledCount,
    failedCount,
    averageOrderValue,
    dailyOrders,
    monthlyOrders,
    yearlyOrders,
    pendingRevenue,
    pendingOrders,
    revenueTrend,
    topItems,
    paymentBreakdown,
  } = financialMetrics;

  useEffect(() => {
    fetchRestaurantProfile();
    fetchFoodItems();
    fetchOrders();
  }, [fetchRestaurantProfile, fetchFoodItems, fetchOrders]);

  useEffect(() => {
    if (activeTab === 'orders' || activeTab === 'finance') {
      fetchOrders();
    }
  }, [activeTab, fetchOrders]);

  const handleAddFoodItem = async () => {
    if (!newFoodItem.name || !newFoodItem.description || !newFoodItem.price || !newFoodItem.category || !newFoodItem.imageFile) {
      alert('Please fill in all fields before adding a food item.');
      return;
    }

    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const formData = new FormData();
      formData.append('name', newFoodItem.name);
      formData.append('description', newFoodItem.description);
      formData.append('price', newFoodItem.price);
      formData.append('category', newFoodItem.category);
      formData.append('image', newFoodItem.imageFile);

      const res = await fetch(`${API_BASE}/api/food-items/create`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        alert('Food item added successfully!');
        fetchFoodItems(); // Refresh the food items list
        setNewFoodItem({ name: '', description: '', price: '', category: '', imageFile: null }); // Reset form
      } else {
        alert(data.message || 'Failed to add food item');
      }
    } catch (err) {
      alert('Error adding food item');
    }
  };

  const handleDeleteFoodItem = async (id) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this food item?');
    if (!confirmDelete) {
      return; // Exit the function if the user cancels
    }
  
    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const res = await fetch(`${API_BASE}/api/food-items/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        alert('Food item deleted successfully!');
        fetchFoodItems(); // Refresh the food items list
      } else {
        alert(data.message || 'Failed to delete food item');
      }
    } catch (err) {
      alert('Error deleting food item');
    }
  };

  const handleEditFoodItem = async () => {
    if (!editFoodItem.name || !editFoodItem.description || !editFoodItem.price || !editFoodItem.category ) {
      alert('Please fill in all fields before updating the food item.');
      return;
    }

    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const formData = new FormData();
      formData.append('name', editFoodItem.name);
      formData.append('description', editFoodItem.description);
      formData.append('price', editFoodItem.price);
      formData.append('category', editFoodItem.category);
      if (editFoodItem.imageFile) {
        formData.append('image', editFoodItem.imageFile);
          } 
      const res = await fetch(`${API_BASE}/api/food-items/${editFoodItem._id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        alert('Food item updated successfully!');
        fetchFoodItems(); // Refresh the food items list
        setEditFoodItem(null); // Clear edit form
      } else {
        alert(data.message || 'Failed to update food item');
      }
    } catch (err) {
      alert('Error updating food item');
    }
  };

  const handleEditProfileClick = () => {
    setEditableProfile({ ...restaurant }); // Copy current profile data
    setEditProfile(true); // Show the edit form
  };

  const handleCancelEdit = () => {
    setEditProfile(false); // Hide the edit form
    setEditableProfile(null); // Reset editable profile data
  };

  const handleEditProfile = async (updatedProfile) => {
    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const formData = new FormData();
  
      // Append fields to FormData
      formData.append('name', updatedProfile.name);
      formData.append('ownerName', updatedProfile.ownerName);
      formData.append('location', updatedProfile.location);
      formData.append('contactNumber', updatedProfile.contactNumber);
  
      // Append profile picture file if it exists
      if (updatedProfile.profilePictureFile) {
        formData.append('profilePicture', updatedProfile.profilePictureFile);
      }
  
      const res = await fetch(`${API_BASE}/api/restaurants/update`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData, // Send FormData
      });
  
      const data = await res.json();
      if (res.ok) {
        alert('Profile updated successfully!');
        fetchRestaurantProfile(); // Refresh profile details
        setEditProfile(false); // Close edit profile form
      } else {
        alert(data.message || 'Failed to update profile');
      }
    } catch (err) {
      alert('Error updating profile');
    }
  };
  const toggleAvailability = async () => {
    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const res = await fetch(`${API_BASE}/api/restaurants/availability`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ availability: !availability }),
      });
      const data = await res.json();
      if (res.ok) {
        setAvailability(!availability);
        alert(data.message);
      }
    } catch (err) {
      alert('Error updating availability');
    }
  };

  return (
    <div className="dashboard-container">
      {/* Topbar */}
      <div className="dashboard-header">
        <p>Hello, <strong>{restaurant.name}</strong> 👋</p>
        <button className="logout-btn" onClick={handleLogout}>Logout</button>
      </div>

      {/* Sidebar */}
      <div className="dashboard-sidebar">
        <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>Profile</button>
        <button className={activeTab === 'foodItems' ? 'active' : ''} onClick={() => setActiveTab('foodItems')}>Food Items</button>
        <button className={activeTab === 'orders' ? 'active' : ''} onClick={() => setActiveTab('orders')}>Orders</button>
        <button className={activeTab === 'finance' ? 'active' : ''} onClick={() => setActiveTab('finance')}>Finance</button>
        <button className={activeTab === 'availability' ? 'active' : ''} onClick={() => setActiveTab('availability')}>Availability</button>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        {activeTab === 'profile' && (
          <div>
            <h2>Profile</h2>
            {editProfile ? (
  <form>
    <input
      type="text"
      placeholder="Name"
      value={editableProfile.name}
      onChange={(e) => setEditableProfile({ ...editableProfile, name: e.target.value })}
    />
    <input
      type="text"
      placeholder="Owner Name"
      value={editableProfile.ownerName}
      onChange={(e) => setEditableProfile({ ...editableProfile, ownerName: e.target.value })}
    />
    <input
      type="text"
      placeholder="Location"
      value={editableProfile.location}
      onChange={(e) => setEditableProfile({ ...editableProfile, location: e.target.value })}
    />
    <input
      type="text"
      placeholder="Contact Number"
      value={editableProfile.contactNumber}
      onChange={(e) => setEditableProfile({ ...editableProfile, contactNumber: e.target.value })}
    />
    <input
      type="file"
      accept="image/*"
      onChange={(e) => setEditableProfile({ ...editableProfile, profilePictureFile: e.target.files[0] })}
    />
    <button type="button"  className="save-btn"onClick={() => handleEditProfile(editableProfile)}>
      Save Changes
    </button>
    <button type="button" className="cancel-btn" onClick={handleCancelEdit}>
      Cancel
    </button>
  </form>
) : (
  <>
    {restaurant.profilePicture && (
      <img
        src={`${API_BASE}${restaurant.profilePicture}`}
        alt="Restaurant"
        style={{
          width: '150px',
          height: '150px',
          borderRadius: '50%',
          objectFit: 'cover',
          marginBottom: '20px',
        }}
      />
    )}
    <p><strong>Name:</strong> {restaurant.name}</p>
    <p><strong>Owner:</strong> {restaurant.ownerName}</p>
    <p><strong>Location:</strong> {restaurant.location}</p>
    <p><strong>Contact:</strong> {restaurant.contactNumber}</p>
    <button className="edit-btn" onClick={handleEditProfileClick}>Edit Profile</button>
  </>
)}
          </div>
        )}

        {activeTab === 'foodItems' && (
          <div>
            <h2>Food Items</h2>
            <input
              type="text"
              placeholder="Search by food name..."
              className="search-bar"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Price</th>
                  <th>Category</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {foodItems
                  .filter((item) =>
                    item.name.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((item) => (
                    <tr key={item._id}>
                      <td>
                        <img
                         src={`${API_BASE}${item.image}`} 
                          alt={item.name}
                          style={{
                            width: '50px',
                            height: '50px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                          }}
                        />
                      </td>
                      <td>{item.name}</td>
                      <td>{item.description}</td>
                      <td>{item.price}</td>
                      <td>{item.category}</td>
                      <td>
                        <button className="fedit-btn" onClick={() => setEditFoodItem(item)}>Edit</button>
                        <button className="fdelete-btn" onClick={() => handleDeleteFoodItem(item._id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {editFoodItem && (
              <div>
                <h3>Edit Food Item</h3>
                <form>
  <input
    type="text"
    placeholder="Name"
    value={editFoodItem.name}
    onChange={(e) => setEditFoodItem({ ...editFoodItem, name: e.target.value })}
  />
  <textarea
    placeholder="Description"
    value={editFoodItem.description}
    onChange={(e) => setEditFoodItem({ ...editFoodItem, description: e.target.value })}
  />
  <input
    type="number"
    placeholder="Price"
    value={editFoodItem.price}
    onChange={(e) => setEditFoodItem({ ...editFoodItem, price: e.target.value })}
  />
  <input
    type="text"
    placeholder="Category"
    value={editFoodItem.category}
    onChange={(e) => setEditFoodItem({ ...editFoodItem, category: e.target.value })}
  />
  <input
    type="file"
    accept="image/*"
    onChange={(e) => setEditFoodItem({ ...editFoodItem, imageFile: e.target.files[0] })}
  />
  <button type="button"  className="rsave-btn" onClick={handleEditFoodItem}>
    Save Changes
  </button>
        <button type="button" className="rcancel-btn" onClick={() => setEditFoodItem(null)}>
          Cancel
        </button>
        </form>
       </div>
             )}

            <h3>Add Food Item</h3>
            <form>
  <input
    type="text"
    placeholder="Name"
    value={newFoodItem.name}
    onChange={(e) => setNewFoodItem({ ...newFoodItem, name: e.target.value })}
  />
  <textarea
    placeholder="Description"
    value={newFoodItem.description}
    onChange={(e) => setNewFoodItem({ ...newFoodItem, description: e.target.value })}
  />
  <input
    type="number"
    placeholder="Price"
    value={newFoodItem.price}
    onChange={(e) => setNewFoodItem({ ...newFoodItem, price: e.target.value })}
  />
  <input
    type="text"
    placeholder="Category"
    value={newFoodItem.category}
    onChange={(e) => setNewFoodItem({ ...newFoodItem, category: e.target.value })}
  />
  <input
    type="file"
    accept="image/*"
    onChange={(e) => setNewFoodItem({ ...newFoodItem, imageFile: e.target.files[0] })}
  />
  <button type="button" onClick={handleAddFoodItem}>
    Add Food Item
  </button>
</form>
          </div>
        )}

        {activeTab === 'finance' && (
          <div className="finance-section">
            <div className="finance-header">
              <h2>Tài chính & Doanh thu</h2>
              <span className="finance-chip">
                {formatNumber(deliveredCount)} đơn hoàn tất
              </span>
            </div>
            {deliveredOrders.length === 0 ? (
              <div className="finance-empty">
                <h3>Chưa có dữ liệu doanh thu</h3>
                <p>Hoàn tất đơn hàng để bắt đầu theo dõi báo cáo tài chính tại đây.</p>
              </div>
            ) : (
              <>
                <div className="finance-overview">
                  <div className="finance-card primary">
                    <h3>Doanh thu hôm nay</h3>
                    <p>{formatCurrency(dailyRevenue)}</p>
                    <span>{formatNumber(dailyOrders)} đơn</span>
                  </div>
                  <div className="finance-card accent">
                    <h3>Doanh thu tháng</h3>
                    <p>{formatCurrency(monthlyRevenue)}</p>
                    <span>{formatNumber(monthlyOrders)} đơn</span>
                  </div>
                  <div className="finance-card emerald">
                    <h3>Doanh thu năm</h3>
                    <p>{formatCurrency(yearlyRevenue)}</p>
                    <span>{formatNumber(yearlyOrders)} đơn</span>
                  </div>
                  <div className="finance-card neutral">
                    <h3>Tổng doanh thu</h3>
                    <p>{formatCurrency(totalRevenue)}</p>
                    <span>Giá trị TB: {formatCurrency(averageOrderValue)}</span>
                  </div>
                  <div className="finance-card warning">
                    <h3>Đơn đang xử lý</h3>
                    <p>{formatCurrency(pendingRevenue)}</p>
                    <span>{formatNumber(pendingOrders)} đơn chờ hoàn tất</span>
                  </div>
                  <div className="finance-card danger">
                    <h3>Đơn hủy / thất bại</h3>
                    <p>{formatNumber(cancelledCount + failedCount)} đơn</p>
                    <span>
                      Hủy: {formatNumber(cancelledCount)} • Thất bại: {formatNumber(failedCount)}
                    </span>
                  </div>
                </div>

                <div className="finance-stats-grid">
                  <div className="finance-panel">
                    <h3>Phương thức thanh toán</h3>
                    <ul className="finance-list compact">
                      <li>
                        <span>Tiền mặt</span>
                        <strong>{formatCurrency(paymentBreakdown.cash)}</strong>
                      </li>
                      <li>
                        <span>Thẻ</span>
                        <strong>{formatCurrency(paymentBreakdown.card)}</strong>
                      </li>
                      <li>
                        <span>Khác</span>
                        <strong>{formatCurrency(paymentBreakdown.other)}</strong>
                      </li>
                    </ul>
                  </div>
                  <div className="finance-panel">
                    <h3>Trạng thái đơn hàng</h3>
                    <ul className="finance-list compact">
                      <li>
                        <span>Hoàn tất</span>
                        <strong>{formatNumber(deliveredCount)}</strong>
                      </li>
                      <li>
                        <span>Đang xử lý</span>
                        <strong>{formatNumber(pendingOrders)}</strong>
                      </li>
                      <li>
                        <span>Đã hủy</span>
                        <strong>{formatNumber(cancelledCount)}</strong>
                      </li>
                      <li>
                        <span>Thất bại</span>
                        <strong>{formatNumber(failedCount)}</strong>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="finance-grid">
                  <div className="finance-panel">
                    <h3>Xu hướng 7 ngày gần nhất</h3>
                    {revenueTrend.length === 0 ? (
                      <p>Chưa có đủ dữ liệu để hiển thị xu hướng.</p>
                    ) : (
                      <table className="finance-table">
                        <thead>
                          <tr>
                            <th>Ngày</th>
                            <th>Doanh thu</th>
                            <th>Đơn</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revenueTrend.map((item) => (
                            <tr key={item.dateKey}>
                              <td>{item.dateLabel}</td>
                              <td>{formatCurrency(item.revenue)}</td>
                              <td>{formatNumber(item.orders)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="finance-panel">
                    <h3>Top món bán chạy</h3>
                    {topItems.length === 0 ? (
                      <p>Chưa có món nào đủ dữ liệu.</p>
                    ) : (
                      <ul className="finance-list">
                        {topItems.map((item) => (
                          <li key={item.name}>
                            <div className="finance-list-label">
                              <span>{item.name}</span>
                              <small>{formatNumber(item.quantity)} món</small>
                            </div>
                            <strong>{formatCurrency(item.revenue)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div>
            <div className="orders-header">
              <h2>Quản lý đơn hàng</h2>
              <button type="button" className="order-refresh-btn" onClick={fetchOrders} disabled={ordersLoading}>
                {ordersLoading ? 'Đang tải...' : 'Tải lại'}
              </button>
            </div>
            {ordersLoading && <p>Đang tải đơn hàng...</p>}
            {!ordersLoading && ordersError && <p className="error-text">{ordersError}</p>}
            {!ordersLoading && !ordersError && orders.length === 0 && (
              <p>Hiện chưa có đơn hàng nào từ khách hàng.</p>
            )}
            {!ordersLoading && !ordersError && orders.length > 0 && (
              <div className="orders-list">
                {orders.map((order) => (
                  <div className="order-card" key={order._id}>
                    <div className="order-card-header">
                      <div>
                        <h3>Đơn #{order._id.slice(-6).toUpperCase()}</h3>
                        <p className="order-meta">
                          Đặt lúc: {new Date(order.createdAt || Date.now()).toLocaleString('vi-VN')}
                        </p>
                      </div>
                      <span className={`status-badge ${ORDER_STATUS_CLASSES[order.status] || ''}`}>
                        {ORDER_STATUS_LABELS[order.status] || order.status}
                      </span>
                    </div>
                    <div className="order-details">
                      <p><strong>Khách hàng:</strong> {order.customerName || 'Ẩn danh'}</p>
                      <p><strong>Số điện thoại:</strong> {order.customerPhone || 'Không có'}</p>
                      <p><strong>Địa chỉ giao:</strong> {order.deliveryAddress}</p>
                      <p>
                        <strong>Thanh toán:</strong> {order.paymentMethod === 'card' ? 'Thẻ' : 'Tiền mặt'} •{' '}
                        {order.paymentStatus || 'Pending'}
                      </p>
                    </div>
                    <div className="order-items">
                      <h4>Món đã đặt</h4>
                      <ul>
                        {order.items?.map((item) => (
                          <li key={`${order._id}_${item.foodId}`}>
                            <span>{item.foodName || 'Món'}</span>
                            <span>x{item.quantity}</span>
                            <span>{formatCurrency((item.price || 0) * (item.quantity || 0))}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="order-footer">
                      <p><strong>Tổng tiền:</strong> {formatCurrency(order.totalPrice)}</p>
                      <div className="order-actions">
                        {ORDER_CANCELABLE_STATUSES.has(order.status) && (
                          <button className="order-secondary-btn" onClick={() => handleCancelOrder(order)}>
                            Hủy đơn
                          </button>
                        )}
                        {ORDER_STATUS_ACTIONS[order.status] && (
                          <button className="order-primary-btn" onClick={() => handleAdvanceOrderStatus(order)}>
                            {ORDER_STATUS_ACTIONS[order.status].label}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'availability' && (
          <div>
            <h2>Availability</h2>
            <p>
              Current Status: <strong>{availability ? 'Open' : 'Closed'}</strong>
            </p>
            <button onClick={toggleAvailability}>
              {availability ? 'Mark as Closed' : 'Mark as Open'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default RestaurantDashboard;
