import React, { useEffect, useMemo, useState } from 'react';
import '../styles/dashboard.css';
import {
  RESTAURANT_SERVICE_URL,
  SUPER_ADMIN_API_URL,
} from '../../../utils/serviceUrls';
import { getAuthToken, clearAuthToken, AUTH_ROLES } from '../../../utils/authTokens';

const TABS = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'customers', label: 'Khách hàng' },
  { id: 'restaurants', label: 'Nhà hàng' },
  { id: 'drivers', label: 'Tài xế' },
  { id: 'orders', label: 'Đơn hàng' },
  { id: 'finance', label: 'Tài chính' },
  { id: 'promotions', label: 'Khuyến mãi' },
  { id: 'reports', label: 'Báo cáo' },
];

const createOptions = (entries) => entries.map(([value, label]) => ({ value, label }));
const createLookup = (entries) => Object.fromEntries(entries);

const CUSTOMER_STATUS_ENTRIES = [
  ['all', 'Tất cả'],
  ['active', 'Đang hoạt động'],
  ['locked', 'Đã khóa'],
];
const CUSTOMER_STATUS_OPTIONS = createOptions(CUSTOMER_STATUS_ENTRIES);

const RESTAURANT_STATUS_ENTRIES = [
  ['all', 'Tất cả'],
  ['pending', 'Chờ duyệt'],
  ['approved', 'Đã duyệt'],
  ['inactive', 'Tạm dừng'],
];
const RESTAURANT_STATUS_OPTIONS = createOptions(RESTAURANT_STATUS_ENTRIES);

const DRIVER_STATUS_ENTRIES = [
  ['all', 'Tất cả'],
  ['pending', 'Chờ duyệt'],
  ['approved', 'Đã duyệt'],
  ['online', 'Đang online'],
  ['offline', 'Đang offline'],
  ['busy', 'Đang giao'],
];
const DRIVER_STATUS_OPTIONS = createOptions(DRIVER_STATUS_ENTRIES);

const ORDER_STATUS_ENTRIES = [
  ['all', 'Tất cả'],
  ['Pending Confirmation', 'Chờ xác nhận'],
  ['Confirmed', 'Đã xác nhận'],
  ['Preparing', 'Đang chuẩn bị'],
  ['Awaiting Driver', 'Chờ tài xế'],
  ['Out for Delivery', 'Đang giao'],
  ['Delivered', 'Đã giao'],
  ['Cancelled', 'Đã hủy'],
  ['Failed', 'Giao thất bại'],
];
const ORDER_STATUS_OPTIONS = createOptions(ORDER_STATUS_ENTRIES);
const ORDER_STATUS_LABELS = createLookup(ORDER_STATUS_ENTRIES);

const FALLBACK_CUSTOMERS = [
  {
    id: 'demo-c1',
    name: 'Nguyễn Văn A',
    email: 'khachhang.a@example.com',
    phone: '0901 234 567',
    status: 'active',
    totalOrders: 18,
    lifetimeSpend: 3650000,
    createdAt: '2024-01-15T08:30:00Z',
  },
  {
    id: 'demo-c2',
    name: 'Trần Thị B',
    email: 'khachhang.b@example.com',
    phone: '0908 765 421',
    status: 'locked',
    totalOrders: 5,
    lifetimeSpend: 820000,
    createdAt: '2023-11-02T14:00:00Z',
  },
  {
    id: 'demo-c3',
    name: 'Phạm Quốc C',
    email: 'khachhang.c@example.com',
    phone: '0912 553 889',
    status: 'active',
    totalOrders: 26,
    lifetimeSpend: 5120000,
    createdAt: '2022-07-21T09:45:00Z',
  },
];

const FALLBACK_RESTAURANTS = [
  {
    id: 'demo-r1',
    name: 'Nhà Hàng Sài Gòn',
    ownerName: 'Lê Minh',
    location: 'Quận 1, TP.HCM',
    contactNumber: '0902 556 889',
    status: 'active',
    approvalStatus: 'approved',
    totalMenus: 32,
    categories: ['Việt Nam', 'Hải sản'],
    adminEmail: 'owner@nhahangsaiGon.vn',
    createdAt: '2024-02-15T08:30:00Z',
    approvedAt: '2024-02-16T09:00:00Z',
  },
  {
    id: 'demo-r2',
    name: 'Bếp Nhà Mẹ',
    ownerName: 'Nguyễn Thị Hoa',
    location: 'Quận 3, TP.HCM',
    contactNumber: '0909 888 111',
    status: 'inactive',
    approvalStatus: 'pending',
    totalMenus: 18,
    categories: ['Gia đình', 'Món miền Trung'],
    adminEmail: 'contact@bepnhame.vn',
    createdAt: '2024-03-10T11:20:00Z',
  },
  {
    id: 'demo-r3',
    name: 'Pizza Corner',
    ownerName: 'John Doe',
    location: 'Quận Bình Thạnh, TP.HCM',
    contactNumber: '0903 777 222',
    status: 'active',
    approvalStatus: 'approved',
    totalMenus: 22,
    categories: ['Âu', 'Tráng miệng'],
    adminEmail: 'support@pizzacorner.vn',
    createdAt: '2024-01-28T16:00:00Z',
    approvedAt: '2024-01-29T10:15:00Z',
    approvalNotes: 'Nhớ cập nhật menu theo mùa 2 lần/tháng.',
  },
];

const FALLBACK_DRIVERS = [
  {
    id: 'demo-d1',
    name: 'Trần Hữu Phúc',
    email: 'phuc.tran@example.com',
    phone: '0905 778 991',
    status: 'online',
    approvalStatus: 'approved',
    totalTrips: 142,
    acceptanceRate: 0.92,
    rating: 4.8,
    currentLocation: 'Quận 5, TP.HCM',
    createdAt: '2024-01-10T08:00:00Z',
    approvedAt: '2024-01-12T09:30:00Z',
  },
  {
    id: 'demo-d2',
    name: 'Ngô Phước Long',
    email: 'long.ngo@example.com',
    phone: '0907 221 554',
    status: 'offline',
    approvalStatus: 'pending',
    totalTrips: 12,
    acceptanceRate: 0.78,
    rating: 4.5,
    currentLocation: 'Quận 12, TP.HCM',
    createdAt: '2024-03-05T14:15:00Z',
  },
  {
    id: 'demo-d3',
    name: 'Phạm Hải Yến',
    email: 'yen.pham@example.com',
    phone: '0912 663 452',
    status: 'busy',
    approvalStatus: 'approved',
    totalTrips: 86,
    acceptanceRate: 0.84,
    rating: 4.9,
    currentLocation: 'TP. Thủ Đức, TP.HCM',
    createdAt: '2024-02-02T10:45:00Z',
    approvedAt: '2024-02-04T09:20:00Z',
    approvalNotes: 'Ưu tiên khu vực trung tâm giờ cao điểm.',
  },
];

const FALLBACK_ORDERS = [
  {
    id: 'demo-o1',
    code: 'DH-1024',
    customerName: 'Nguyễn Văn A',
    restaurantName: 'Nhà Hàng Sài Gòn',
    driverName: 'Trần Hữu Phúc',
    status: 'Pending Confirmation',
    total: 185000,
    paymentMethod: 'COD',
    createdAt: '2024-03-12T10:30:00Z',
  },
  {
    id: 'demo-o2',
    code: 'DH-1025',
    customerName: 'Trần Thị B',
    restaurantName: 'Pizza Corner',
    driverName: 'Phạm Hải Yến',
    status: 'Out for Delivery',
    total: 265000,
    paymentMethod: 'Online',
    createdAt: '2024-03-12T11:05:00Z',
  },
  {
    id: 'demo-o3',
    code: 'DH-1026',
    customerName: 'Phạm Quốc C',
    restaurantName: 'Bếp Nhà Mẹ',
    driverName: 'Ngô Phước Long',
    status: 'Delivered',
    total: 312000,
    paymentMethod: 'Online',
    createdAt: '2024-03-11T18:40:00Z',
  },
];

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
};

const joinName = (firstName, lastName, fallback = 'Chưa cập nhật') => {
  const name = `${firstName || ''} ${lastName || ''}`.trim();
  return name || fallback;
};

const normalizeCustomers = (list = []) =>
  list
    .filter(Boolean)
    .map((item) => {
      const id = item._id || item.id;
      return {
        id,
        name: item.name || joinName(item.firstName, item.lastName),
        email: item.email || '—',
        phone: item.phone || item.contact || '—',
        status:
          item.status ||
          item.accountStatus ||
          (item.isActive === false ? 'locked' : 'active'),
        totalOrders: item.totalOrders || item.orderCount || 0,
        lifetimeSpend: item.lifetimeSpend || item.totalSpend || 0,
        createdAt: item.createdAt,
        addresses: item.addresses || item.savedAddresses || [],
      };
    });

const normalizeRestaurants = (list = []) =>
  list
    .filter(Boolean)
    .map((item) => {
      const id = item._id || item.id;
      const approval =
        item.approvalStatus ||
        item.status ||
        (item.availability === false ? 'inactive' : 'approved');
      return {
        id,
        name: item.name || 'Chưa đặt tên',
        ownerName: item.ownerName || item.owner || '—',
        location: item.location || item.address || '—',
        contactNumber: item.contactNumber || item.phoneNumber || '—',
        adminEmail: item.admin?.email || item.email || '—',
        status: item.availability === false ? 'inactive' : 'active',
        approvalStatus: approval,
        approvalNotes: item.approvalNotes || '',
        approvedAt: item.approvedAt,
        rejectedAt: item.rejectedAt,
        createdAt: item.createdAt,
        totalMenus: item.menuItems?.length ?? item.menuCount ?? 0,
        categories: item.categories || item.cuisines || [],
        preparationTime: item.preparationTime || item.avgPreparationTime || 0,
      };
    });

const normalizeDrivers = (list = []) =>
  list
    .filter(Boolean)
    .map((item) => {
      const id = item._id || item.id;
      return {
        id,
        name: item.name || joinName(item.firstName, item.lastName),
        email: item.email || '—',
        phone: item.phone || item.phoneNumber || '—',
        status: item.status || item.activityStatus || 'offline',
        approvalStatus: item.approvalStatus || item.onboardingStatus || 'pending',
        approvalNotes: item.approvalNotes || '',
        approvedAt: item.approvedAt,
        rejectedAt: item.rejectedAt,
        totalTrips: item.totalTrips || item.completedTrips || 0,
        acceptanceRate: item.acceptanceRate ?? item.acceptanceRatio ?? 0,
        rating: item.rating ?? item.averageRating ?? null,
        currentLocation: item.currentLocation || item.lastKnownAddress || '—',
        createdAt: item.createdAt,
      };
    });

const normalizeOrders = (list = []) =>
  list
    .filter(Boolean)
    .map((item) => {
      const id = item._id || item.id;
      return {
        id,
        code: item.code || item.orderCode || id,
        customerName: item.customerName || item.customer?.name || '—',
        restaurantName: item.restaurantName || item.restaurant?.name || '—',
        driverName: item.driverName || item.driver?.name || '—',
        status: item.status || 'Pending Confirmation',
        total: item.total || item.grandTotal || 0,
        paymentMethod: item.paymentMethod || item.payment?.method || 'COD',
        createdAt: item.createdAt || item.placedAt,
      };
    });

function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [superAdminName, setSuperAdminName] = useState('');
  const token = getAuthToken(AUTH_ROLES.SUPER_ADMIN);

  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('all');
  const [customerLoading, setCustomerLoading] = useState(true);
  const [customerAlert, setCustomerAlert] = useState(null);

  const [restaurants, setRestaurants] = useState([]);
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [restaurantStatusFilter, setRestaurantStatusFilter] = useState('all');
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [restaurantAlert, setRestaurantAlert] = useState(null);
  const [editingRestaurant, setEditingRestaurant] = useState(null);
  const [restaurantFormData, setRestaurantFormData] = useState({
    name: '',
    ownerName: '',
    location: '',
    contactNumber: '',
  });
  const [menuPreview, setMenuPreview] = useState({
    open: false,
    restaurant: null,
    loading: false,
    items: [],
    error: '',
  });

  const [drivers, setDrivers] = useState([]);
  const [driverFilter, setDriverFilter] = useState('all');
  const [driversLoading, setDriversLoading] = useState(true);
  const [driverAlert, setDriverAlert] = useState(null);

  const [orders, setOrders] = useState([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orderAlert, setOrderAlert] = useState(null);

  const [promotionForm, setPromotionForm] = useState({
    code: '',
    discountType: 'percentage',
    value: 10,
    usageLimit: 100,
    expiresAt: '',
    minOrderValue: 150000,
    description: '',
  });
  const [promotionMessage, setPromotionMessage] = useState('');

  useEffect(() => {
    const name = localStorage.getItem('superAdminName');
    if (name) {
      setSuperAdminName(name);
    }
  }, []);

  const fetchJSON = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `Yêu cầu thất bại (${response.status})`);
    }
    return data;
  };

  useEffect(() => {
    let ignore = false;
    const loadCustomers = async () => {
      setCustomerLoading(true);
      setCustomerAlert(null);
      try {
        const data = await fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/customers`);
        if (!ignore) {
          const normalized = normalizeCustomers(data.customers || data);
          setCustomers(normalized);
          setCustomerAlert(
            normalized.length
              ? null
              : { type: 'info', message: 'Chưa có khách hàng nào trong hệ thống.' }
          );
        }
      } catch (error) {
        if (!ignore) {
          setCustomers(normalizeCustomers(FALLBACK_CUSTOMERS));
          setCustomerAlert({
            type: 'warning',
            message:
              'Không thể tải dữ liệu khách hàng thực tế, hệ thống đang hiển thị dữ liệu mẫu để bạn tham khảo.',
          });
        }
      } finally {
        if (!ignore) {
          setCustomerLoading(false);
        }
      }
    };
    loadCustomers();
    return () => {
      ignore = true;
    };
  }, [token]);

  useEffect(() => {
    let ignore = false;
    const loadRestaurants = async () => {
      setRestaurantsLoading(true);
      setRestaurantAlert(null);
      try {
        const data = await fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/restaurants`);
        if (!ignore) {
          const normalized = normalizeRestaurants(data);
          setRestaurants(normalized);
          setRestaurantAlert(
            normalized.length
              ? null
              : { type: 'info', message: 'Chưa có nhà hàng nào đăng ký trong hệ thống.' }
          );
        }
      } catch (error) {
        if (!ignore) {
          setRestaurants(normalizeRestaurants(FALLBACK_RESTAURANTS));
          setRestaurantAlert({
            type: 'warning',
            message:
              'Không thể tải dữ liệu nhà hàng thực tế, đang hiển thị danh sách mẫu để dễ dàng đánh giá giao diện.',
          });
        }
      } finally {
        if (!ignore) {
          setRestaurantsLoading(false);
        }
      }
    };
    loadRestaurants();
    return () => {
      ignore = true;
    };
  }, [token]);

  useEffect(() => {
    let ignore = false;
    const loadDrivers = async () => {
      setDriversLoading(true);
      setDriverAlert(null);
      try {
        const data = await fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/drivers`);
        if (!ignore) {
          const normalized = normalizeDrivers(data.drivers || data);
          setDrivers(normalized);
          setDriverAlert(
            normalized.length
              ? null
              : { type: 'info', message: 'Chưa có tài xế nào đăng ký vào hệ thống.' }
          );
        }
      } catch (error) {
        if (!ignore) {
          setDrivers(normalizeDrivers(FALLBACK_DRIVERS));
          setDriverAlert({
            type: 'warning',
            message:
              'Không thể tải dữ liệu tài xế thực tế, đang hiển thị danh sách mẫu để bạn tiếp tục kiểm tra giao diện.',
          });
        }
      } finally {
        if (!ignore) {
          setDriversLoading(false);
        }
      }
    };
    loadDrivers();
    return () => {
      ignore = true;
    };
  }, [token]);

  useEffect(() => {
    let ignore = false;
    const loadOrders = async () => {
      setOrdersLoading(true);
      setOrderAlert(null);
      try {
        const data = await fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/orders?scope=all`);
        if (!ignore) {
          const normalized = normalizeOrders(data.orders || data);
          setOrders(normalized);
          setOrderAlert(
            normalized.length
              ? null
              : { type: 'info', message: 'Hiện chưa có đơn hàng nào trong hệ thống.' }
          );
        }
      } catch (error) {
        if (!ignore) {
          setOrders(normalizeOrders(FALLBACK_ORDERS));
          setOrderAlert({
            type: 'warning',
            message:
              'Không thể tải dữ liệu đơn hàng thực tế, đang hiển thị dữ liệu mẫu để giúp bạn xem các thao tác.',
          });
        }
      } finally {
        if (!ignore) {
          setOrdersLoading(false);
        }
      }
    };
    loadOrders();
    return () => {
      ignore = true;
    };
  }, [token]);

  const handleLogout = () => {
    clearAuthToken(AUTH_ROLES.SUPER_ADMIN);
    localStorage.removeItem('superAdminName');
    window.location.href = '/restaurant/home';
  };

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesQuery =
        !query ||
        customer.name.toLowerCase().includes(query) ||
        (customer.email && customer.email.toLowerCase().includes(query)) ||
        (customer.phone &&
          customer.phone.replace(/\s+/g, '').includes(query.replace(/\s+/g, '')));
      const matchesStatus =
        customerStatusFilter === 'all' || customer.status === customerStatusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [customers, customerSearch, customerStatusFilter]);

  const filteredRestaurants = useMemo(() => {
    const query = restaurantSearch.trim().toLowerCase();
    return restaurants.filter((restaurant) => {
      const matchesQuery =
        !query ||
        restaurant.name.toLowerCase().includes(query) ||
        restaurant.ownerName.toLowerCase().includes(query) ||
        restaurant.location.toLowerCase().includes(query);
      const matchesStatus =
        restaurantStatusFilter === 'all' ||
        restaurant.approvalStatus === restaurantStatusFilter ||
        restaurant.status === restaurantStatusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [restaurants, restaurantSearch, restaurantStatusFilter]);

  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      if (driverFilter === 'all') return true;
      if (driverFilter === 'pending' || driverFilter === 'approved') {
        return driver.approvalStatus === driverFilter;
      }
      return driver.status === driverFilter;
    });
  }, [drivers, driverFilter]);

  const filteredOrders = useMemo(() => {
    if (orderStatusFilter === 'all') return orders;
    return orders.filter((order) => order.status === orderStatusFilter);
  }, [orders, orderStatusFilter]);

  const overviewMetrics = useMemo(() => {
    const activeCustomers = customers.filter((customer) => customer.status === 'active').length;
    const pendingRestaurants = restaurants.filter(
      (restaurant) => restaurant.approvalStatus === 'pending'
    ).length;
    const approvedRestaurants = restaurants.filter(
      (restaurant) => restaurant.approvalStatus === 'approved'
    ).length;
    const onlineDrivers = drivers.filter((driver) => driver.status === 'online').length;
    const openOrders = orders.filter(
      (order) => !['Delivered', 'Cancelled', 'Failed'].includes(order.status)
    ).length;
    const deliveredOrders = orders.filter((order) => order.status === 'Delivered');
    const totalRevenue = deliveredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const cancellationRate =
      orders.length === 0
        ? 0
        : orders.filter((order) => order.status === 'Cancelled').length / orders.length;

    return {
      totalCustomers: customers.length,
      activeCustomers,
      totalRestaurants: restaurants.length,
      approvedRestaurants,
      pendingRestaurants,
      totalDrivers: drivers.length,
      onlineDrivers,
      openOrders,
      totalRevenue,
      cancellationRate,
    };
  }, [customers, restaurants, drivers, orders]);

  const handleCustomerStatusToggle = async (customerId, currentStatus) => {
    const nextStatus = currentStatus === 'locked' ? 'active' : 'locked';
    const snapshot = customers;
    setCustomers((prev) =>
      prev.map((customer) =>
        customer.id === customerId ? { ...customer, status: nextStatus } : customer
      )
    );
    try {
      await fetchJSON(`${RESTAURANT_SERVICE_URL}/api/superadmin/customers/${customerId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
    } catch (error) {
      alert(`Không thể cập nhật trạng thái khách hàng: ${error.message}`);
      setCustomers(snapshot);
    }
  };

  const handleEditRestaurant = (restaurant) => {
    setEditingRestaurant(restaurant.id);
    setRestaurantFormData({
      name: restaurant.name,
      ownerName: restaurant.ownerName,
      location: restaurant.location,
      contactNumber: restaurant.contactNumber,
    });
  };

  const handleRestaurantFormChange = (event) => {
    const { name, value } = event.target;
    setRestaurantFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveRestaurant = async () => {
    if (!editingRestaurant) return;
    const snapshot = restaurants;
    const payload = { ...restaurantFormData };
    setRestaurants((prev) =>
      prev.map((restaurant) =>
        restaurant.id === editingRestaurant ? { ...restaurant, ...payload } : restaurant
      )
    );
    try {
      await fetchJSON(
        `${SUPER_ADMIN_API_URL}/api/superadmin/restaurant/${editingRestaurant}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      alert('Đã lưu thông tin nhà hàng.');
    } catch (error) {
      alert(`Không thể cập nhật nhà hàng: ${error.message}`);
      setRestaurants(snapshot);
    } finally {
      setEditingRestaurant(null);
    }
  };

  const handleRestaurantStatusChange = async (restaurantId, action) => {
    const snapshot = restaurants;
    const target = snapshot.find((item) => item.id === restaurantId);
    if (!target) return;

    let optimisticNotes = target.approvalNotes;
    let request;

    if (action === 'approve') {
      const notes = window.prompt('Ghi chú cho nhà hàng (tùy chọn)', target.approvalNotes || '') || '';
      optimisticNotes = notes;
      setRestaurants((prev) =>
        prev.map((restaurant) =>
          restaurant.id === restaurantId
            ? { ...restaurant, approvalStatus: 'approved', status: 'active', approvalNotes: notes }
            : restaurant
        )
      );
      request = fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/restaurant/${restaurantId}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      });
    } else if (action === 'reject') {
      const reason =
        window.prompt('Nhập lý do từ chối (sẽ gửi cho nhà hàng)', target.approvalNotes || '') || '';
      optimisticNotes = reason;
      setRestaurants((prev) =>
        prev.map((restaurant) =>
          restaurant.id === restaurantId
            ? {
                ...restaurant,
                approvalStatus: 'rejected',
                status: 'inactive',
                approvalNotes: reason,
              }
            : restaurant
        )
      );
      request = fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/restaurant/${restaurantId}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      });
    } else if (action === 'toggle-active') {
      const nextStatus = target.status === 'active' ? 'inactive' : 'active';
      setRestaurants((prev) =>
        prev.map((restaurant) =>
          restaurant.id === restaurantId ? { ...restaurant, status: nextStatus } : restaurant
        )
      );
      request = fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/restaurant/${restaurantId}`, {
        method: 'PUT',
        body: JSON.stringify({ availability: nextStatus === 'active' }),
      });
    }

    if (!request) return;

    try {
      await request;
    } catch (error) {
      alert(`Không thể cập nhật trạng thái nhà hàng: ${error.message}`);
      setRestaurants(snapshot);
    }
  };

  const handleOpenMenuPreview = async (restaurant) => {
    setMenuPreview({
      open: true,
      restaurant,
      loading: true,
      items: [],
      error: '',
    });
    try {
      const data = await fetchJSON(
        `${RESTAURANT_SERVICE_URL}/api/food-items/restaurant/${restaurant.id}`
      );
      setMenuPreview({
        open: true,
        restaurant,
        loading: false,
        items: Array.isArray(data) ? data : data.items || [],
        error: '',
      });
    } catch (error) {
      setMenuPreview({
        open: true,
        restaurant,
        loading: false,
        items: [],
        error: error.message,
      });
    }
  };

  const handleCloseMenuPreview = () => {
    setMenuPreview({
      open: false,
      restaurant: null,
      loading: false,
      items: [],
      error: '',
    });
  };

  const handleDriverApproval = async (driverId, nextStatus) => {
    const snapshot = drivers;
    const target = snapshot.find((item) => item.id === driverId);
    if (!target) return;

    let notes = target.approvalNotes || '';
    if (nextStatus === 'approved') {
      notes = window.prompt('Ghi chú gửi cho tài xế (tùy chọn)', notes) || '';
    } else if (nextStatus === 'rejected') {
      notes = window.prompt('Nhập lý do từ chối (sẽ gửi cho tài xế)', notes) || '';
    }

    setDrivers((prev) =>
      prev.map((driver) =>
        driver.id === driverId ? { ...driver, approvalStatus: nextStatus, approvalNotes: notes } : driver
      )
    );
    try {
      await fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/drivers/${driverId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ approvalStatus: nextStatus, notes }),
      });
    } catch (error) {
      alert(`Không thể cập nhật tài xế: ${error.message}`);
      setDrivers(snapshot);
    }
  };

  const handleDriverToggleStatus = async (driverId) => {
    const snapshot = drivers;
    const cycle = ['offline', 'online', 'busy'];
    const current = snapshot.find((driver) => driver.id === driverId)?.status || 'offline';
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    setDrivers((prev) =>
      prev.map((driver) => (driver.id === driverId ? { ...driver, status: next } : driver))
    );
    try {
      await fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/drivers/${driverId}/activity`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
    } catch (error) {
      alert(`Không thể đổi trạng thái tài xế: ${error.message}`);
      setDrivers(snapshot);
    }
  };

  const handleOrderStatusChange = async (orderId, nextStatus) => {
    const snapshot = orders;
    setOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, status: nextStatus } : order))
    );
    try {
      await fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, initiatedBy: 'admin' }),
      });
    } catch (error) {
      alert(`Không thể cập nhật đơn hàng: ${error.message}`);
      setOrders(snapshot);
    }
  };

  const handlePromotionChange = (event) => {
    const { name, value } = event.target;
    setPromotionForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePromotionSubmit = (event) => {
    event.preventDefault();
    setPromotionMessage('Đã lưu chiến dịch khuyến mãi (demo).');
  };

  const financialSummary = useMemo(() => {
    const delivered = orders.filter((order) => order.status === 'Delivered');
    const grossRevenue = delivered.reduce((sum, order) => sum + (order.total || 0), 0);
    const restaurantShare = grossRevenue * 0.8;
    const driverShare = grossRevenue * 0.15;
    const platformCommission = grossRevenue * 0.05;
    return { grossRevenue, restaurantShare, driverShare, platformCommission };
  }, [orders]);

  const renderAlert = (alert) =>
    alert ? (
      <div className={`sa-banner ${alert.type || 'info'}`}>{alert.message || alert}</div>
    ) : null;

  const renderOverview = () => (
    <section className="sa-section">
      <div className="sa-grid metrics">
        <div className="sa-card metric">
          <h3>Khách hàng</h3>
          <p className="sa-highlight">{overviewMetrics.totalCustomers}</p>
          <span>{overviewMetrics.activeCustomers} đang hoạt động</span>
        </div>
        <div className="sa-card metric">
          <h3>Nhà hàng</h3>
          <p className="sa-highlight">{overviewMetrics.totalRestaurants}</p>
          <span>{overviewMetrics.pendingRestaurants} chờ duyệt</span>
        </div>
        <div className="sa-card metric">
          <h3>Tài xế</h3>
          <p className="sa-highlight">{overviewMetrics.totalDrivers}</p>
          <span>{overviewMetrics.onlineDrivers} đang online</span>
        </div>
        <div className="sa-card metric">
          <h3>Đơn hàng mở</h3>
          <p className="sa-highlight">{overviewMetrics.openOrders}</p>
          <span>Doanh thu: {formatCurrency(overviewMetrics.totalRevenue)}</span>
        </div>
        <div className="sa-card metric">
          <h3>Tỷ lệ hủy</h3>
          <p className="sa-highlight">
            {(overviewMetrics.cancellationRate * 100).toFixed(1)}%
          </p>
          <span>Duy trì dưới 5% để đảm bảo SLA</span>
        </div>
      </div>
    </section>
  );

  const renderCustomers = () => (
    <section className="sa-section">
      <header className="sa-section-header">
        <div>
          <h2>Quản lý khách hàng</h2>
          <p>Tìm kiếm, xem lịch sử và khóa/mở khóa tài khoản.</p>
        </div>
        <div className="sa-controls">
          <input
            type="search"
            className="sa-input"
            placeholder="Tìm theo tên, email, số điện thoại..."
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
          />
          <select
            className="sa-select"
            value={customerStatusFilter}
            onChange={(event) => setCustomerStatusFilter(event.target.value)}
          >
            {CUSTOMER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </header>
      {renderAlert(customerAlert)}
      {customerLoading ? (
        <p>Đang tải dữ liệu khách hàng...</p>
      ) : (
        <div className="sa-table-wrapper">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Email</th>
                <th>Số điện thoại</th>
                <th>Số đơn</th>
                <th>Chi tiêu</th>
                <th>Trạng thái</th>
                <th>Ngày tham gia</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.email}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.totalOrders}</td>
                  <td>{formatCurrency(customer.lifetimeSpend)}</td>
                  <td>
                    <span className={`sa-status ${customer.status}`}>
                      {customer.status === 'active' ? 'Đang hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  <td>{formatDateTime(customer.createdAt)}</td>
                  <td>
                    <button
                      className="sa-button ghost"
                      onClick={() => handleCustomerStatusToggle(customer.id, customer.status)}
                    >
                      {customer.status === 'locked' ? 'Mở khóa' : 'Khóa'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderRestaurants = () => (
    <section className="sa-section">
      <header className="sa-section-header">
        <div>
          <h2>Quản lý nhà hàng</h2>
          <p>Duyệt hồ sơ, cập nhật thông tin và giám sát thực đơn.</p>
        </div>
        <div className="sa-controls">
          <input
            type="search"
            className="sa-input"
            placeholder="Lọc theo tên, chủ sở hữu, địa điểm..."
            value={restaurantSearch}
            onChange={(event) => setRestaurantSearch(event.target.value)}
          />
          <select
            className="sa-select"
            value={restaurantStatusFilter}
            onChange={(event) => setRestaurantStatusFilter(event.target.value)}
          >
            {RESTAURANT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </header>
      {renderAlert(restaurantAlert)}
      {restaurantsLoading ? (
        <p>Đang tải dữ liệu nhà hàng...</p>
      ) : (
        <div className="sa-table-wrapper">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Nhà hàng</th>
                <th>Chủ sở hữu</th>
                <th>Liên hệ</th>
                <th>Danh mục</th>
                <th>Món</th>
                <th>Trạng thái</th>
                <th>Duyệt</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredRestaurants.map((restaurant) => (
                <tr key={restaurant.id}>
                  <td>
                    <div className="sa-stack">
                      <strong>{restaurant.name}</strong>
                      <span>{restaurant.location}</span>
                      {restaurant.createdAt && (
                        <span className="sa-meta">Đăng ký: {formatDateTime(restaurant.createdAt)}</span>
                      )}
                      {restaurant.approvedAt && (
                        <span className="sa-meta">Duyệt: {formatDateTime(restaurant.approvedAt)}</span>
                      )}
                    </div>
                  </td>
                  <td>{restaurant.ownerName}</td>
                  <td>
                    <div className="sa-stack">
                      <span>{restaurant.contactNumber}</span>
                      <span className="sa-meta">{restaurant.adminEmail}</span>
                    </div>
                  </td>
                  <td>{restaurant.categories.join(', ') || '—'}</td>
                  <td>{restaurant.totalMenus}</td>
                  <td>
                    <span className={`sa-status ${restaurant.status}`}>
                      {restaurant.status === 'active' ? 'Đang mở' : 'Tạm dừng'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`sa-status badge ${
                        restaurant.approvalStatus === 'approved'
                          ? 'success'
                          : restaurant.approvalStatus === 'pending'
                          ? 'warning'
                          : 'danger'
                      }`}
                    >
                      {restaurant.approvalStatus === 'approved'
                        ? 'Đã duyệt'
                        : restaurant.approvalStatus === 'pending'
                        ? 'Chờ duyệt'
                        : 'Từ chối'}
                    </span>
                    {restaurant.approvalNotes && (
                      <span className="sa-meta">Ghi chú: {restaurant.approvalNotes}</span>
                    )}
                  </td>
                  <td className="sa-actions">
                    <button
                      className="sa-button primary"
                      onClick={() => handleOpenMenuPreview(restaurant)}
                    >
                      Xem thực đơn
                    </button>
                    <button
                      className="sa-button ghost"
                      onClick={() => handleEditRestaurant(restaurant)}
                    >
                      Chỉnh sửa
                    </button>
                    {restaurant.approvalStatus === 'pending' ? (
                      <>
                        <button
                          className="sa-button success"
                          onClick={() => handleRestaurantStatusChange(restaurant.id, 'approve')}
                        >
                          Duyệt
                        </button>
                        <button
                          className="sa-button danger"
                          onClick={() => handleRestaurantStatusChange(restaurant.id, 'reject')}
                        >
                          Từ chối
                        </button>
                      </>
                    ) : restaurant.approvalStatus === 'rejected' ? (
                      <button
                        className="sa-button success"
                        onClick={() => handleRestaurantStatusChange(restaurant.id, 'approve')}
                      >
                        Duyệt lại
                      </button>
                    ) : (
                      <>
                        <button
                          className="sa-button warning"
                          onClick={() => handleRestaurantStatusChange(restaurant.id, 'toggle-active')}
                        >
                          {restaurant.status === 'active' ? 'Tạm dừng' : 'Mở lại'}
                        </button>
                        <button
                          className="sa-button danger"
                          onClick={() => handleRestaurantStatusChange(restaurant.id, 'reject')}
                        >
                          Thu hồi
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingRestaurant && (
        <div className="sa-drawer">
          <div className="sa-drawer-header">
            <h3>Cập nhật thông tin</h3>
            <button className="sa-button ghost" onClick={() => setEditingRestaurant(null)}>
              Đóng
            </button>
          </div>
          <div className="sa-drawer-body">
            <label>
              Tên nhà hàng
              <input
                type="text"
                name="name"
                className="sa-input"
                value={restaurantFormData.name}
                onChange={handleRestaurantFormChange}
              />
            </label>
            <label>
              Chủ sở hữu
              <input
                type="text"
                name="ownerName"
                className="sa-input"
                value={restaurantFormData.ownerName}
                onChange={handleRestaurantFormChange}
              />
            </label>
            <label>
              Địa điểm
              <input
                type="text"
                name="location"
                className="sa-input"
                value={restaurantFormData.location}
                onChange={handleRestaurantFormChange}
              />
            </label>
            <label>
              Số điện thoại
              <input
                type="tel"
                name="contactNumber"
                className="sa-input"
                value={restaurantFormData.contactNumber}
                onChange={handleRestaurantFormChange}
              />
            </label>
          </div>
          <div className="sa-drawer-footer">
            <button className="sa-button ghost" onClick={() => setEditingRestaurant(null)}>
              Hủy
            </button>
            <button className="sa-button primary" onClick={handleSaveRestaurant}>
              Lưu thay đổi
            </button>
          </div>
        </div>
      )}

      {menuPreview.open && (
        <div className="sa-modal">
          <div className="sa-modal-content">
            <div className="sa-modal-header">
              <h3>Thực đơn: {menuPreview.restaurant?.name}</h3>
              <button className="sa-button ghost" onClick={handleCloseMenuPreview}>
                Đóng
              </button>
            </div>
            <div className="sa-modal-body">
              {menuPreview.loading ? (
                <p>Đang tải thực đơn...</p>
              ) : menuPreview.error ? (
                <p className="sa-error">{menuPreview.error}</p>
              ) : menuPreview.items.length === 0 ? (
                <p>Chưa có món nào được đăng tải.</p>
              ) : (
                <ul className="sa-menu-list">
                  {menuPreview.items.map((item) => (
                    <li key={item._id || item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.description}</span>
                      </div>
                      <div className="sa-stack">
                        <span>{formatCurrency(item.price)}</span>
                        <span>{item.category}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );

  const renderDrivers = () => (
    <section className="sa-section">
      <header className="sa-section-header">
        <div>
          <h2>Quản lý tài xế</h2>
          <p>Phê duyệt hồ sơ, theo dõi trạng thái và hiệu suất giao hàng.</p>
        </div>
        <select
          className="sa-select"
          value={driverFilter}
          onChange={(event) => setDriverFilter(event.target.value)}
        >
          {DRIVER_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>
      {renderAlert(driverAlert)}
      {driversLoading ? (
        <p>Đang tải dữ liệu tài xế...</p>
      ) : (
        <div className="sa-table-wrapper">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Tài xế</th>
                <th>Liên hệ</th>
                <th>Đơn hoàn tất</th>
                <th>Tỷ lệ nhận</th>
                <th>Đánh giá</th>
                <th>Trạng thái</th>
                <th>Duyệt</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.map((driver) => (
                <tr key={driver.id}>
                  <td>
                    <div className="sa-stack">
                      <strong>{driver.name}</strong>
                      <span>{driver.currentLocation}</span>
                      {driver.createdAt && (
                        <span className="sa-meta">Đăng ký: {formatDateTime(driver.createdAt)}</span>
                      )}
                      {driver.approvedAt && (
                        <span className="sa-meta">Duyệt: {formatDateTime(driver.approvedAt)}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="sa-stack">
                      <span>{driver.phone}</span>
                      <span className="sa-meta">{driver.email || '—'}</span>
                    </div>
                  </td>
                  <td>{driver.totalTrips}</td>
                  <td>{Math.round((driver.acceptanceRate || 0) * 100)}%</td>
                  <td>{driver.rating ? driver.rating.toFixed(1) : '—'}</td>
                  <td>
                    <span className={`sa-status ${driver.status}`}>
                      {driver.status === 'online'
                        ? 'Online'
                        : driver.status === 'busy'
                        ? 'Đang giao'
                        : 'Offline'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`sa-status badge ${
                        driver.approvalStatus === 'approved'
                          ? 'success'
                          : driver.approvalStatus === 'pending'
                          ? 'warning'
                          : 'danger'
                      }`}
                    >
                      {driver.approvalStatus === 'approved'
                        ? 'Đã duyệt'
                        : driver.approvalStatus === 'pending'
                        ? 'Chờ duyệt'
                        : 'Từ chối'}
                    </span>
                    {driver.approvalNotes && (
                      <span className="sa-meta">Ghi chú: {driver.approvalNotes}</span>
                    )}
                  </td>
                  <td className="sa-actions">
                    {driver.approvalStatus === 'pending' ? (
                      <>
                        <button
                          className="sa-button success"
                          onClick={() => handleDriverApproval(driver.id, 'approved')}
                        >
                          Duyệt
                        </button>
                        <button
                          className="sa-button danger"
                          onClick={() => handleDriverApproval(driver.id, 'rejected')}
                        >
                          Từ chối
                        </button>
                      </>
                    ) : driver.approvalStatus === 'rejected' ? (
                      <button
                        className="sa-button success"
                        onClick={() => handleDriverApproval(driver.id, 'approved')}
                      >
                        Duyệt lại
                      </button>
                    ) : (
                      <button
                        className="sa-button warning"
                        onClick={() => handleDriverToggleStatus(driver.id)}
                      >
                        Chuyển trạng thái
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderOrders = () => (
    <section className="sa-section">
      <header className="sa-section-header">
        <div>
          <h2>Quản lý đơn hàng</h2>
          <p>Theo dõi, lọc và can thiệp thủ công vào đơn hàng toàn hệ thống.</p>
        </div>
        <select
          className="sa-select"
          value={orderStatusFilter}
          onChange={(event) => setOrderStatusFilter(event.target.value)}
        >
          {ORDER_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>
      {renderAlert(orderAlert)}
      {ordersLoading ? (
        <p>Đang tải dữ liệu đơn hàng...</p>
      ) : (
        <div className="sa-table-wrapper">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th>Nhà hàng</th>
                <th>Tài xế</th>
                <th>Thanh toán</th>
                <th>Trạng thái</th>
                <th>Thời gian</th>
                <th>Can thiệp</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td>{order.code}</td>
                  <td>{order.customerName}</td>
                  <td>{order.restaurantName}</td>
                  <td>{order.driverName || 'Đang phân công'}</td>
                  <td>
                    {formatCurrency(order.total)} • {order.paymentMethod}
                  </td>
                  <td>
                    <span
                      className={`sa-status badge ${order.status.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>
                  </td>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td>
                    <select
                      className="sa-select inline"
                      value={order.status}
                      onChange={(event) => handleOrderStatusChange(order.id, event.target.value)}
                    >
                      {ORDER_STATUS_OPTIONS.filter((option) => option.value !== 'all').map(
                        (option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        )
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderFinance = () => (
    <section className="sa-section">
      <header className="sa-section-header">
        <div>
          <h2>Đối soát & Tài chính</h2>
          <p>Theo dõi dòng tiền, hoa hồng và ngân sách hoàn trả.</p>
        </div>
      </header>
      <div className="sa-grid finance">
        <div className="sa-card">
          <h3>Tổng doanh thu ghi nhận</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.grossRevenue)}</p>
        </div>
        <div className="sa-card">
          <h3>Thanh toán cho nhà hàng</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.restaurantShare)}</p>
          <span>80% doanh thu</span>
        </div>
        <div className="sa-card">
          <h3>Thanh toán cho tài xế</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.driverShare)}</p>
          <span>15% doanh thu</span>
        </div>
        <div className="sa-card">
          <h3>Hoa hồng nền tảng</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.platformCommission)}</p>
          <span>5% doanh thu</span>
        </div>
      </div>
      <div className="sa-card note">
        <h4>Hoàn tiền & Ví điện tử</h4>
        <p>
          Kết nối Payment Service để lập lịch hoàn tiền tự động và quản lý số dư ví khách hàng,
          tài xế.
        </p>
      </div>
    </section>
  );

  const renderPromotions = () => (
    <section className="sa-section">
      <header className="sa-section-header">
        <div>
          <h2>Quản lý khuyến mãi</h2>
          <p>Tạo mã giảm giá, đặt điều kiện áp dụng và giới hạn sử dụng.</p>
        </div>
      </header>
      <form className="sa-form" onSubmit={handlePromotionSubmit}>
        <div className="sa-form-row">
          <label>
            Mã voucher
            <input
              type="text"
              name="code"
              className="sa-input"
              value={promotionForm.code}
              onChange={handlePromotionChange}
              placeholder="VD: FREESHIP20"
              required
            />
          </label>
          <label>
            Loại giảm
            <select
              name="discountType"
              className="sa-select"
              value={promotionForm.discountType}
              onChange={handlePromotionChange}
            >
              <option value="percentage">Giảm theo %</option>
              <option value="amount">Giảm theo số tiền</option>
              <option value="freeship">Miễn phí giao hàng</option>
            </select>
          </label>
          <label>
            Giá trị
            <input
              type="number"
              name="value"
              className="sa-input"
              min={0}
              value={promotionForm.value}
              onChange={handlePromotionChange}
            />
          </label>
        </div>
        <div className="sa-form-row">
          <label>
            Giới hạn lượt dùng
            <input
              type="number"
              name="usageLimit"
              className="sa-input"
              min={1}
              value={promotionForm.usageLimit}
              onChange={handlePromotionChange}
            />
          </label>
          <label>
            Đơn tối thiểu
            <input
              type="number"
              name="minOrderValue"
              className="sa-input"
              min={0}
              value={promotionForm.minOrderValue}
              onChange={handlePromotionChange}
            />
          </label>
          <label>
            Ngày hết hạn
            <input
              type="date"
              name="expiresAt"
              className="sa-input"
              value={promotionForm.expiresAt}
              onChange={handlePromotionChange}
            />
          </label>
        </div>
        <label>
          Mô tả chiến dịch
          <textarea
            name="description"
            className="sa-input"
            rows={3}
            value={promotionForm.description}
            onChange={handlePromotionChange}
            placeholder="Thông điệp gửi tới khách hàng, phạm vi áp dụng..."
          />
        </label>
        <div className="sa-form-footer">
          <button className="sa-button primary" type="submit">
            Lưu chiến dịch
          </button>
          {promotionMessage && <span className="sa-hint">{promotionMessage}</span>}
        </div>
      </form>
    </section>
  );

  const renderReports = () => {
    const topRestaurants = [...restaurants]
      .sort((a, b) => (b.totalMenus || 0) - (a.totalMenus || 0))
      .slice(0, 5);
    const topDrivers = [...drivers]
      .sort((a, b) => (b.totalTrips || 0) - (a.totalTrips || 0))
      .slice(0, 5);
    const statusStats = ORDER_STATUS_OPTIONS.filter((option) => option.value !== 'all').map(
      (option) => {
        const count = orders.filter((order) => order.status === option.value).length;
        const ratio = orders.length ? Math.round((count / orders.length) * 100) : 0;
        return { label: option.label, ratio };
      }
    );

    return (
      <section className="sa-section">
        <header className="sa-section-header">
          <div>
            <h2>Báo cáo & Phân tích</h2>
            <p>Quan sát xu hướng doanh thu, hiệu suất đối tác và trạng thái đơn hàng.</p>
          </div>
        </header>
        <div className="sa-grid reports">
          <div className="sa-card">
            <h3>Top nhà hàng theo số món</h3>
            <ul className="sa-list">
              {topRestaurants.map((restaurant) => (
                <li key={restaurant.id}>
                  <span>{restaurant.name}</span>
                  <strong>{restaurant.totalMenus}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className="sa-card">
            <h3>Top tài xế theo số chuyến</h3>
            <ul className="sa-list">
              {topDrivers.map((driver) => (
                <li key={driver.id}>
                  <span>{driver.name}</span>
                  <strong>{driver.totalTrips}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className="sa-card stretch">
            <h3>Tỷ lệ trạng thái đơn hàng</h3>
            <ul className="sa-list columns">
              {statusStats.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.ratio}%</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'customers':
        return renderCustomers();
      case 'restaurants':
        return renderRestaurants();
      case 'drivers':
        return renderDrivers();
      case 'orders':
        return renderOrders();
      case 'finance':
        return renderFinance();
      case 'promotions':
        return renderPromotions();
      case 'reports':
        return renderReports();
      default:
        return null;
    }
  };

  return (
    <div className="sa-dashboard">
      <header className="sa-header">
        <div>
          <h1>Super Admin Control Center</h1>
          <p>
            Xin chào, <strong>{superAdminName || 'Super Admin'}</strong> 👋. Quản lý toàn bộ hệ
            sinh thái trong một giao diện.
          </p>
        </div>
        <button className="sa-button danger" onClick={handleLogout}>
          Đăng xuất
        </button>
      </header>
      <nav className="sa-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`sa-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="sa-content">{renderContent()}</main>
    </div>
  );
}

export default SuperAdminDashboard;
