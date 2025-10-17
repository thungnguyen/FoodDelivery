import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import '../styles/rdashboard.css';
import { io } from 'socket.io-client';
import { RESTAURANT_SERVICE_URL, ORDER_SERVICE_URL, REALTIME_SERVICE_URL } from '../../../utils/serviceUrls';
import { getAuthToken, clearAuthToken, AUTH_ROLES } from '../../../utils/authTokens';

const FALLBACK_IMAGE =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23eceff1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2399a1a7" font-family="Arial" font-size="14">No Image</text></svg>';

const useFilePreview = (file) => {
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!file) {
      setPreview('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return preview;
};

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
    imageFile: null,
    imageMode: 'file',
  });
  const [editFoodItem, setEditFoodItem] = useState(null); // For editing food items
  const [editProfile, setEditProfile] = useState(false); // For editing profile
  const [editableProfile, setEditableProfile] = useState(null); // For editable profile data
  const API_BASE = RESTAURANT_SERVICE_URL;
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const ORDER_API_BASE = ORDER_SERVICE_URL;
  const socketRef = useRef(null);
  const subscribedOrdersRef = useRef(new Set());
  const restaurantRoomRef = useRef(null);
  const restaurantIdRef = useRef(null);
  const ordersRef = useRef([]);
  const isMountedRef = useRef(false);

  const resolveImageSrc = useCallback(
    (raw) => {
      if (!raw || typeof raw !== 'string') {
        return '';
      }

      const trimmed = raw.trim();
      if (!trimmed) {
        return '';
      }

      if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
        return trimmed;
      }

      if (/^(?:https?:)?\/\//i.test(trimmed)) {
        if (trimmed.startsWith('//')) {
          const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
          return `${protocol}${trimmed}`;
        }
        return trimmed;
      }

      if (trimmed.startsWith('/')) {
        return `${API_BASE}${trimmed}`;
      }

      return `${API_BASE}/${trimmed}`;
    },
    [API_BASE]
  );

  const handleImageError = useCallback((event) => {
    event.currentTarget.onerror = null;
    event.currentTarget.src = FALLBACK_IMAGE;
  }, []);

  const profileImageSrc = useMemo(
    () => resolveImageSrc(restaurant.profilePicture),
    [resolveImageSrc, restaurant.profilePicture]
  );

  const newFoodFilePreview = useFilePreview(
    newFoodItem.imageMode === 'file' ? newFoodItem.imageFile : null
  );
  const editFoodFilePreview = useFilePreview(
    editFoodItem?.imageMode === 'file' ? editFoodItem.imageFile : null
  );
  const profileFilePreview = useFilePreview(
    editableProfile?.profileImageMode === 'file' ? editableProfile.profilePictureFile : null
  );

  const newFoodImagePreview = useMemo(() => {
    if (newFoodItem.imageMode === 'file') {
      return newFoodFilePreview;
    }
    return resolveImageSrc(newFoodItem.imageUrl);
  }, [newFoodFilePreview, newFoodItem.imageMode, newFoodItem.imageUrl, resolveImageSrc]);

  const editFoodImagePreview = useMemo(() => {
    if (!editFoodItem) {
      return '';
    }
    if (editFoodItem.imageMode === 'file') {
      return editFoodFilePreview;
    }
    return resolveImageSrc(editFoodItem.imageUrl || editFoodItem.image);
  }, [editFoodFilePreview, editFoodItem, resolveImageSrc]);

  const editableProfileImagePreview = useMemo(() => {
    if (!editableProfile) {
      return '';
    }

    if (editableProfile.profileImageMode === 'file') {
      return profileFilePreview;
    }

    return resolveImageSrc(
      editableProfile.profilePictureUrl || editableProfile.profilePicture
    );
  }, [editableProfile, profileFilePreview, resolveImageSrc]);

  const editFoodPreviewSrc = useMemo(() => {
    if (!editFoodItem) {
      return '';
    }
    return editFoodImagePreview || resolveImageSrc(editFoodItem.image) || '';
  }, [editFoodImagePreview, editFoodItem, resolveImageSrc]);

  const handleOpenEditFoodItem = useCallback((item) => {
    setEditFoodItem({
      ...item,
      imageUrl: item.image || '',
      imageFile: null,
      imageMode: 'url',
    });
  }, [setEditFoodItem]);

  const filteredFoodItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return foodItems;
    }
    return foodItems.filter((item) =>
      item.name?.toLowerCase().includes(query)
    );
  }, [foodItems, searchQuery]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

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

  const fetchOrders = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setOrdersLoading(true);
        }
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
        if (!isMountedRef.current) {
          return;
        }
        if (res.ok) {
          const sortedOrders = Array.isArray(data)
            ? [...data].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            : [];
          setOrders(sortedOrders);
        } else {
          setOrdersError(data.message || 'Không thể tải danh sách đơn hàng.');
        }
      } catch (err) {
        if (isMountedRef.current) {
          setOrdersError('Có lỗi khi tải danh sách đơn hàng.');
        }
      } finally {
        if (!silent && isMountedRef.current) {
          setOrdersLoading(false);
        }
      }
    },
    [ORDER_API_BASE, handleUnauthorizedError]
  );

  const handleRealtimeEvent = useCallback(
    (message) => {
      if (!message || typeof message !== 'object') return;
      const { event, payload } = message;
      if (!event || !isMountedRef.current) return;

      const currentRestaurantId = restaurantIdRef.current
        ? String(restaurantIdRef.current)
        : null;
      const payloadRestaurantId = payload?.restaurantId
        ? String(payload.restaurantId)
        : null;
      const isRelevantRestaurant =
        !currentRestaurantId ||
        !payloadRestaurantId ||
        payloadRestaurantId === currentRestaurantId;

      if (!isRelevantRestaurant) {
        return;
      }

      switch (event) {
        case 'order.status.changed': {
          const orderId = payload?.orderId;
          if (!orderId) return;
          setOrders((prev) => {
            const index = prev.findIndex((order) => (order._id || order.id) === orderId);
            if (index === -1) {
              return prev;
            }
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: payload?.status || next[index].status,
              updatedAt: payload?.updatedAt || next[index].updatedAt,
            };
            return next;
          });
          fetchOrders({ silent: true });
          break;
        }
        case 'order.created': {
          fetchOrders({ silent: true });
          break;
        }
        case 'order.cancelled': {
          const orderId = payload?.orderId;
          if (!orderId) return;
          setOrders((prev) => {
            const index = prev.findIndex((order) => (order._id || order.id) === orderId);
            if (index === -1) {
              return prev;
            }
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: payload?.status || 'Cancelled',
            };
            return next;
          });
          fetchOrders({ silent: true });
          break;
        }
        default:
          break;
      }
    },
    [fetchOrders]
  );

  useEffect(() => {
    const token = getAuthToken(AUTH_ROLES.RESTAURANT);
    if (!token) return;

    const socket = io(REALTIME_SERVICE_URL, {
      transports: ['websocket'],
      auth: { token },
    });

    socketRef.current = socket;
    socket.on('realtime:event', handleRealtimeEvent);
    socket.on('connect_error', (err) => {
      console.error('Realtime (restaurant) connection error:', err.message);
    });

    socket.on('connect', () => {
      const currentOrders = ordersRef.current || [];
      currentOrders.forEach((order) => {
        const orderId = order?._id || order?.id;
        if (!orderId) return;
        const id = String(orderId);
        socket.emit('realtime:subscribe', `order:${id}`);
        subscribedOrdersRef.current.add(id);
      });
      if (restaurantRoomRef.current) {
        socket.emit('realtime:subscribe', restaurantRoomRef.current);
      }
    });

    return () => {
      socket.off('realtime:event', handleRealtimeEvent);
      if (restaurantRoomRef.current) {
        socket.emit('realtime:unsubscribe', restaurantRoomRef.current);
      }
      socket.disconnect();
      socketRef.current = null;
      subscribedOrdersRef.current.clear();
      restaurantRoomRef.current = null;
    };
  }, [handleRealtimeEvent]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const rawId =
      restaurant?._id ||
      restaurant?.id ||
      restaurant?.restaurantId ||
      (restaurant?.data && restaurant.data._id);
    const normalizedId = rawId ? String(rawId) : null;
    restaurantIdRef.current = normalizedId;

    const nextRoom = normalizedId ? `restaurant:${normalizedId}` : null;
    const previousRoom = restaurantRoomRef.current;

    if (previousRoom && previousRoom !== nextRoom) {
      socket.emit('realtime:unsubscribe', previousRoom);
      restaurantRoomRef.current = null;
    }

    if (nextRoom && nextRoom !== previousRoom) {
      socket.emit('realtime:subscribe', nextRoom);
      restaurantRoomRef.current = nextRoom;
    }
  }, [restaurant]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const currentIds = new Set();
    orders.forEach((order) => {
      const orderId = order?._id || order?.id;
      if (!orderId) return;
      const id = String(orderId);
      currentIds.add(id);
      if (!subscribedOrdersRef.current.has(id)) {
        socket.emit('realtime:subscribe', `order:${id}`);
        subscribedOrdersRef.current.add(id);
      }
    });

    Array.from(subscribedOrdersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        socket.emit('realtime:unsubscribe', `order:${id}`);
        subscribedOrdersRef.current.delete(id);
      }
    });
  }, [orders]);

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
      fetchOrders({ silent: true });
    }
  }, [activeTab, fetchOrders]);

  const handleAddFoodItem = async () => {
    const trimmedName = newFoodItem.name?.trim();
    const trimmedDescription = newFoodItem.description?.trim();
    const trimmedCategory = newFoodItem.category?.trim();
    const trimmedPrice = newFoodItem.price;
    const trimmedUrl = newFoodItem.imageUrl?.trim() || '';

    if (!trimmedName || !trimmedDescription || !trimmedPrice || !trimmedCategory) {
      alert('Please fill in all fields before adding a food item.');
      return;
    }

    const wantsFile = newFoodItem.imageMode === 'file' && newFoodItem.imageFile;
    const wantsUrl = newFoodItem.imageMode === 'url' && trimmedUrl;

    if (!wantsFile && !wantsUrl) {
      alert('Please choose an image file or provide an image URL.');
      return;
    }

    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const formData = new FormData();
      formData.append('name', trimmedName);
      formData.append('description', trimmedDescription);
      formData.append('price', trimmedPrice);
      formData.append('category', trimmedCategory);

      if (wantsFile) {
        formData.append('image', newFoodItem.imageFile);
      }

      if (wantsUrl) {
        formData.append('imageUrl', trimmedUrl);
      }

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
        setNewFoodItem({
          name: '',
          description: '',
          price: '',
          category: '',
          imageUrl: '',
          imageFile: null,
          imageMode: 'file',
        }); // Reset form
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
    if (!editFoodItem) {
      return;
    }

    const trimmedName = editFoodItem.name?.trim();
    const trimmedDescription = editFoodItem.description?.trim();
    const trimmedCategory = editFoodItem.category?.trim();
    const trimmedPrice = editFoodItem.price;
    const trimmedUrl = editFoodItem.imageUrl?.trim() || editFoodItem.image?.trim() || '';

    if (!trimmedName || !trimmedDescription || !trimmedPrice || !trimmedCategory) {
      alert('Please fill in all fields before updating the food item.');
      return;
    }

    const wantsFile = editFoodItem.imageMode === 'file' && editFoodItem.imageFile;
    const wantsUrl = editFoodItem.imageMode === 'url' && trimmedUrl;

    if (!wantsFile && !wantsUrl) {
      alert('Please choose an image file or provide an image URL.');
      return;
    }

    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const formData = new FormData();
      formData.append('name', trimmedName);
      formData.append('description', trimmedDescription);
      formData.append('price', trimmedPrice);
      formData.append('category', trimmedCategory);

      if (wantsFile) {
        formData.append('image', editFoodItem.imageFile);
      }

      if (wantsUrl) {
        formData.append('imageUrl', trimmedUrl);
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
    setEditableProfile({
      ...restaurant,
      profilePictureUrl: restaurant.profilePicture || '',
      profilePictureFile: null,
      profileImageMode: restaurant.profilePicture ? 'url' : 'file',
    }); // Copy current profile data
    setEditProfile(true); // Show the edit form
  };

  const handleCancelEdit = () => {
    setEditProfile(false); // Hide the edit form
    setEditableProfile(null); // Reset editable profile data
  };

  const handleEditProfile = async (updatedProfile) => {
    const trimmedName = updatedProfile.name?.trim();
    const trimmedOwner = updatedProfile.ownerName?.trim();
    const trimmedLocation = updatedProfile.location?.trim();
    const trimmedContact = updatedProfile.contactNumber?.trim();
    const trimmedUrl = updatedProfile.profilePictureUrl?.trim() || '';

    if (!trimmedName || !trimmedOwner || !trimmedLocation || !trimmedContact) {
      alert('Please complete all profile fields before saving.');
      return;
    }

    if (updatedProfile.profileImageMode === 'url' && !trimmedUrl) {
      alert('Please provide a valid image URL.');
      return;
    }

    try {
      const token = getAuthToken(AUTH_ROLES.RESTAURANT);
      const formData = new FormData();

      // Append fields to FormData
      formData.append('name', trimmedName);
      formData.append('ownerName', trimmedOwner);
      formData.append('location', trimmedLocation);
      formData.append('contactNumber', trimmedContact);

      if (updatedProfile.profileImageMode === 'file' && updatedProfile.profilePictureFile) {
        formData.append('profilePicture', updatedProfile.profilePictureFile);
      }

      if (updatedProfile.profileImageMode === 'url') {
        formData.append('profilePictureUrl', trimmedUrl);
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
          <div className="profile-section">
            <div className="section-header">
              <div>
                <h2>Hồ sơ nhà hàng</h2>
                <p>Thông tin này hiển thị với khách hàng trong ứng dụng.</p>
              </div>
              {!editProfile && (
                <button className="edit-btn" type="button" onClick={handleEditProfileClick}>
                  Chỉnh sửa
                </button>
              )}
            </div>
            {editProfile && editableProfile ? (
              <form
                className="form-card profile-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleEditProfile(editableProfile);
                }}
              >
                <div className="profile-form-grid">
                  <div className="profile-media-field">
                    <span className="field-label">Ảnh đại diện</span>
                    <div className="image-mode-toggle">
                      <button
                        type="button"
                        className={editableProfile.profileImageMode === 'file' ? 'active' : ''}
                        onClick={() =>
                          setEditableProfile((prev) => ({
                            ...prev,
                            profileImageMode: 'file',
                            profilePictureFile: null,
                          }))
                        }
                      >
                        Chọn ảnh
                      </button>
                      <button
                        type="button"
                        className={editableProfile.profileImageMode === 'url' ? 'active' : ''}
                        onClick={() =>
                          setEditableProfile((prev) => ({
                            ...prev,
                            profileImageMode: 'url',
                          }))
                        }
                      >
                        Dùng URL
                      </button>
                    </div>
                    {editableProfile.profileImageMode === 'file' ? (
                      <label className="file-picker">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) =>
                            setEditableProfile((prev) => ({
                              ...prev,
                              profilePictureFile: event.target.files?.[0] || null,
                            }))
                          }
                        />
                        <span>Chọn ảnh từ thiết bị</span>
                      </label>
                    ) : (
                      <input
                        type="text"
                        className="text-input"
                        placeholder="https://example.com/thumbnail.jpg"
                        value={editableProfile.profilePictureUrl || ''}
                        onChange={(event) =>
                          setEditableProfile((prev) => ({
                            ...prev,
                            profilePictureUrl: event.target.value,
                          }))
                        }
                      />
                    )}
                    <div className="image-preview">
                      <img
                        src={editableProfileImagePreview || profileImageSrc || FALLBACK_IMAGE}
                        alt="Restaurant preview"
                        onError={handleImageError}
                      />
                    </div>
                  </div>
                  <div className="profile-fields">
                    <label>
                      <span className="field-label">Tên nhà hàng</span>
                      <input
                        type="text"
                        className="text-input"
                        value={editableProfile.name || ''}
                        onChange={(event) =>
                          setEditableProfile((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span className="field-label">Chủ sở hữu</span>
                      <input
                        type="text"
                        className="text-input"
                        value={editableProfile.ownerName || ''}
                        onChange={(event) =>
                          setEditableProfile((prev) => ({
                            ...prev,
                            ownerName: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span className="field-label">Địa chỉ</span>
                      <input
                        type="text"
                        className="text-input"
                        value={editableProfile.location || ''}
                        onChange={(event) =>
                          setEditableProfile((prev) => ({
                            ...prev,
                            location: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span className="field-label">Số liên hệ</span>
                      <input
                        type="text"
                        className="text-input"
                        value={editableProfile.contactNumber || ''}
                        onChange={(event) =>
                          setEditableProfile((prev) => ({
                            ...prev,
                            contactNumber: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="form-primary">
                    Lưu thay đổi
                  </button>
                  <button type="button" className="form-secondary" onClick={handleCancelEdit}>
                    Hủy
                  </button>
                </div>
              </form>
            ) : (
              <div className="profile-card">
                <div className="profile-card-media">
                  <img
                    src={profileImageSrc || FALLBACK_IMAGE}
                    alt="Restaurant"
                    onError={handleImageError}
                  />
                  <span className={`status-pill ${availability ? 'open' : 'closed'}`}>
                    {availability ? 'Đang mở cửa' : 'Tạm đóng'}
                  </span>
                </div>
                <div className="profile-card-body">
                  <h3>{restaurant.name || 'Chưa cập nhật'}</h3>
                  <ul className="profile-details">
                    <li>
                      <span>Chủ nhà hàng</span>
                      <strong>{restaurant.ownerName || 'Chưa cập nhật'}</strong>
                    </li>
                    <li>
                      <span>Địa chỉ</span>
                      <strong>{restaurant.location || 'Chưa cập nhật'}</strong>
                    </li>
                    <li>
                      <span>Liên hệ</span>
                      <strong>{restaurant.contactNumber || 'Chưa cập nhật'}</strong>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'foodItems' && (
          <div className="food-section">
            <div className="section-header">
              <div>
                <h2>Quản lý thực đơn</h2>
                <p>Chỉnh sửa món hiện có và thêm sản phẩm mới với hình ảnh rõ nét.</p>
              </div>
            </div>
            <div className="food-layout">
              <div className="food-table-card">
                <div className="list-toolbar">
                  <input
                    type="text"
                    className="text-input"
                    placeholder="Tìm kiếm theo tên món..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
                {filteredFoodItems.length === 0 ? (
                  <div className="empty-state">
                    <h3>Không tìm thấy món ăn</h3>
                    <p>Thử từ khóa khác hoặc thêm món mới ở khung bên cạnh.</p>
                  </div>
                ) : (
                  <div className="food-table-wrapper">
                    <table className="food-table">
                      <thead>
                        <tr>
                          <th>Hình ảnh</th>
                          <th>Tên món</th>
                          <th>Mô tả</th>
                          <th>Giá</th>
                          <th>Phân loại</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFoodItems.map((item) => {
                          const imageSrc = resolveImageSrc(item.image);
                          return (
                            <tr key={item._id}>
                              <td>
                                <div className="food-thumb">
                                  <img
                                    src={imageSrc || FALLBACK_IMAGE}
                                    alt={item.name}
                                    onError={handleImageError}
                                  />
                                </div>
                              </td>
                              <td>{item.name}</td>
                              <td className="food-description">{item.description || '—'}</td>
                              <td>{formatCurrency(item.price)}</td>
                              <td>{item.category || '—'}</td>
                              <td className="food-actions">
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() => handleOpenEditFoodItem(item)}
                                >
                                  Chỉnh sửa
                                </button>
                                <button
                                  type="button"
                                  className="link-button danger"
                                  onClick={() => handleDeleteFoodItem(item._id)}
                                >
                                  Xóa
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="food-editor-stack">
                {editFoodItem && (
                  <div className="form-card">
                    <div className="form-card-header">
                      <h3>Chỉnh sửa món</h3>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setEditFoodItem(null)}
                      >
                        Đóng
                      </button>
                    </div>
                    <div className="form-grid">
                      <label>
                        <span className="field-label">Tên món</span>
                        <input
                          type="text"
                          className="text-input"
                          value={editFoodItem.name || ''}
                          onChange={(event) =>
                            setEditFoodItem((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span className="field-label">Mô tả</span>
                        <textarea
                          className="text-area"
                          value={editFoodItem.description || ''}
                          onChange={(event) =>
                            setEditFoodItem((prev) => ({
                              ...prev,
                              description: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span className="field-label">Giá</span>
                        <input
                          type="number"
                          min="0"
                          className="text-input"
                          value={editFoodItem.price}
                          onChange={(event) =>
                            setEditFoodItem((prev) => ({ ...prev, price: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        <span className="field-label">Loại món</span>
                        <input
                          type="text"
                          className="text-input"
                          value={editFoodItem.category || ''}
                          onChange={(event) =>
                            setEditFoodItem((prev) => ({
                              ...prev,
                              category: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className="image-field">
                      <span className="field-label">Hình ảnh</span>
                      <div className="image-mode-toggle">
                        <button
                          type="button"
                          className={editFoodItem.imageMode === 'file' ? 'active' : ''}
                          onClick={() =>
                            setEditFoodItem((prev) => ({
                              ...prev,
                              imageMode: 'file',
                              imageFile: null,
                            }))
                          }
                        >
                          Chọn ảnh
                        </button>
                        <button
                          type="button"
                          className={editFoodItem.imageMode === 'url' ? 'active' : ''}
                          onClick={() =>
                            setEditFoodItem((prev) => ({
                              ...prev,
                              imageMode: 'url',
                            }))
                          }
                        >
                          Dùng URL
                        </button>
                      </div>
                      {editFoodItem.imageMode === 'file' ? (
                        <label className="file-picker">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              setEditFoodItem((prev) => ({
                                ...prev,
                                imageFile: event.target.files?.[0] || null,
                              }))
                            }
                          />
                          <span>Chọn ảnh mới</span>
                        </label>
                      ) : (
                        <input
                          type="text"
                          className="text-input"
                          placeholder="https://example.com/food.jpg"
                          value={editFoodItem.imageUrl || ''}
                          onChange={(event) =>
                            setEditFoodItem((prev) => ({
                              ...prev,
                              imageUrl: event.target.value,
                            }))
                          }
                        />
                      )}
                      <div className="image-preview">
                        <img
                          src={editFoodPreviewSrc || FALLBACK_IMAGE}
                          alt="Food preview"
                          onError={handleImageError}
                        />
                      </div>
                    </div>
                    <div className="form-actions">
                      <button type="button" className="form-primary" onClick={handleEditFoodItem}>
                        Lưu
                      </button>
                      <button
                        type="button"
                        className="form-secondary"
                        onClick={() => setEditFoodItem(null)}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
                <div className="form-card">
                  <h3>Thêm món mới</h3>
                  <div className="form-grid">
                    <label>
                      <span className="field-label">Tên món</span>
                      <input
                        type="text"
                        className="text-input"
                        value={newFoodItem.name}
                        onChange={(event) =>
                          setNewFoodItem((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span className="field-label">Mô tả</span>
                      <textarea
                        className="text-area"
                        value={newFoodItem.description}
                        onChange={(event) =>
                          setNewFoodItem((prev) => ({
                            ...prev,
                            description: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span className="field-label">Giá</span>
                      <input
                        type="number"
                        min="0"
                        className="text-input"
                        value={newFoodItem.price}
                        onChange={(event) =>
                          setNewFoodItem((prev) => ({ ...prev, price: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span className="field-label">Loại món</span>
                      <input
                        type="text"
                        className="text-input"
                        value={newFoodItem.category}
                        onChange={(event) =>
                          setNewFoodItem((prev) => ({
                            ...prev,
                            category: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="image-field">
                    <span className="field-label">Hình ảnh món</span>
                    <div className="image-mode-toggle">
                      <button
                        type="button"
                        className={newFoodItem.imageMode === 'file' ? 'active' : ''}
                        onClick={() =>
                          setNewFoodItem((prev) => ({
                            ...prev,
                            imageMode: 'file',
                            imageFile: null,
                          }))
                        }
                      >
                        Chọn ảnh
                      </button>
                      <button
                        type="button"
                        className={newFoodItem.imageMode === 'url' ? 'active' : ''}
                        onClick={() =>
                          setNewFoodItem((prev) => ({
                            ...prev,
                            imageMode: 'url',
                          }))
                        }
                      >
                        Dùng URL
                      </button>
                    </div>
                    {newFoodItem.imageMode === 'file' ? (
                      <label className="file-picker">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) =>
                            setNewFoodItem((prev) => ({
                              ...prev,
                              imageFile: event.target.files?.[0] || null,
                            }))
                          }
                        />
                        <span>Chọn ảnh từ thiết bị</span>
                      </label>
                    ) : (
                      <input
                        type="text"
                        className="text-input"
                        placeholder="https://example.com/food.jpg"
                        value={newFoodItem.imageUrl}
                        onChange={(event) =>
                          setNewFoodItem((prev) => ({
                            ...prev,
                            imageUrl: event.target.value,
                          }))
                        }
                      />
                    )}
                    <div className="image-preview">
                      <img
                        src={newFoodImagePreview || FALLBACK_IMAGE}
                        alt="Food preview"
                        onError={handleImageError}
                      />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="form-primary" onClick={handleAddFoodItem}>
                      Thêm món
                    </button>
                  </div>
                </div>
              </div>
            </div>
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
              <button
                type="button"
                className="order-refresh-btn"
                onClick={() => fetchOrders()}
                disabled={ordersLoading}
              >
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
