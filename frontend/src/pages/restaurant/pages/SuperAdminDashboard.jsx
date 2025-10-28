import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
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

const arrayFromPayload = (payload, preferredKeys = [], seen = new Set()) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  if (seen.has(payload)) {
    return [];
  }

  seen.add(payload);

  for (const key of preferredKeys) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (candidate && typeof candidate === 'object') {
      const nested = arrayFromPayload(candidate, preferredKeys, seen);
      if (nested.length) {
        return nested;
      }
    }
  }

  const fallbackKeys = ['data', 'items', 'results', 'docs', 'list', 'rows', 'content', 'records'];
  for (const key of fallbackKeys) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (candidate && typeof candidate === 'object') {
      const nested = arrayFromPayload(candidate, preferredKeys, seen);
      if (nested.length) {
        return nested;
      }
    }
  }

  const objectValues = Object.values(payload).filter(
    (value) => value && typeof value === 'object' && !Array.isArray(value)
  );
  if (objectValues.length) {
    return objectValues;
  }

  return [];
};

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

const SECTION_ICONS = {
  overview: '📊',
  customers: '🧑‍🤝‍🧑',
  restaurants: '🍽️',
  drivers: '🛵',
  orders: '📦',
  finance: '💰',
  promotions: '🎁',
  reports: '📈',
};

const ALERT_ICONS = {
  info: 'ℹ️',
  warning: '⚠️',
  danger: '🚨',
};

const REALTIME_URL = process.env.REACT_APP_REALTIME_URL || 'http://localhost:5050';

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

const formatNumber = (value = 0) => new Intl.NumberFormat('vi-VN').format(value);

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

const formatOrderCode = (value, fallback = 'Đơn') => {
  if (!value) return `${fallback} —`;
  const compact = String(value).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!compact) {
    return `${fallback} —`;
  }
  const suffix = compact.slice(-6).padStart(6, '0');
  return `${fallback} #${suffix}`;
};

const formatPaymentMethod = (value) => {
  const method = typeof value === 'string' ? value.trim().toLowerCase() : '';
  switch (method) {
    case 'cod':
    case 'cash':
      return 'Tiền mặt';
    case 'card':
      return 'Thẻ';
    case 'momo':
      return 'MoMo';
    case 'zalopay':
      return 'ZaloPay';
    case 'bank_transfer':
      return 'Chuyển khoản';
    case 'online':
      return 'Online';
    default:
      return method ? method.toUpperCase() : 'COD';
  }
};

const formatPaymentStatus = (value) => {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  switch (status) {
    case 'paid':
      return 'Đã thanh toán';
    case 'pending':
      return 'Chờ thanh toán';
    case 'failed':
      return 'Thanh toán lỗi';
    case 'refunded':
      return 'Đã hoàn tiền';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Chờ thanh toán';
  }
};

const formatDriverStatus = (value) => {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  switch (status) {
    case 'online':
      return 'Đang online';
    case 'offline':
      return 'Ngoại tuyến';
    case 'busy':
      return 'Đang giao';
    case 'available':
      return 'Sẵn sàng';
    case 'on-delivery':
      return 'Đang giao';
    case 'pending':
      return 'Chờ duyệt';
    case 'approved':
      return 'Đã duyệt';
    case 'rejected':
      return 'Bị từ chối';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
  }
};

const joinName = (firstName, lastName, fallback = 'Chưa cập nhật') => {
  const name = `${firstName || ''} ${lastName || ''}`.trim();
  return name || fallback;
};

const normalizeCustomers = (raw = []) => {
  const list = arrayFromPayload(raw, ['customers']);
  return list
    .filter(Boolean)
    .map((item) => {
      const id = item._id || item.id;
      return {
        id,
        name: item.name || item.fullName || joinName(item.firstName, item.lastName),
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
};

const normalizeRestaurants = (raw = []) => {
  const list = arrayFromPayload(raw, ['restaurants']);
  return list
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
};

const normalizeDrivers = (raw = []) => {
  const list = arrayFromPayload(raw, ['drivers']);
  return list
    .filter(Boolean)
    .map((item) => {
      const id = item._id || item.id;
      return {
        id,
        name: item.name || item.fullName || joinName(item.firstName, item.lastName),
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
};

const normalizeOrders = (raw = []) => {
  const list = arrayFromPayload(raw, ['orders']);
  return list
    .filter(Boolean)
    .map((item) => {
      const id = item._id || item.id;
      const customerRef =
        item.customer ||
        item.customerInfo ||
        item.customerDetails ||
        item.customerProfile ||
        {};
      const restaurantRef =
        item.restaurant ||
        item.restaurantInfo ||
        item.restaurantDetails ||
        item.restaurantProfile ||
        {};
      const driverRef =
        item.driver ||
        item.driverInfo ||
        item.assignedDriver ||
        item.driverDetails ||
        {};

      const customerId =
        item.customerId ||
        customerRef._id ||
        customerRef.id ||
        customerRef.customerId ||
        null;
      const restaurantId =
        item.restaurantId ||
        restaurantRef._id ||
        restaurantRef.id ||
        restaurantRef.restaurantId ||
        null;
      const driverId =
        item.driverId ||
        item.assignedDriverId ||
        driverRef._id ||
        driverRef.id ||
        driverRef.driverId ||
        null;

      const rawCode = item.code || item.orderCode || item.reference || id;
      const status =
        item.status ||
        item.orderStatus ||
        item.currentStatus ||
        'Pending Confirmation';

      const paymentMethod =
        item.paymentMethod ||
        item.payment?.method ||
        item.paymentInfo?.method ||
        'COD';

      const paymentStatus =
        item.paymentStatus ||
        item.payment?.status ||
        item.paymentInfo?.status ||
        'Pending';

      return {
        id,
        rawCode,
        code: rawCode,
        customerId: customerId ? String(customerId) : null,
        customerName:
          item.customerName ||
          customerRef.name ||
          customerRef.fullName ||
          customerRef.displayName ||
          '—',
        customerPhone:
          item.customerPhone ||
          customerRef.phone ||
          customerRef.contactNumber ||
          customerRef.mobile ||
          '',
        restaurantId: restaurantId ? String(restaurantId) : null,
        restaurantName:
          item.restaurantName ||
          restaurantRef.name ||
          restaurantRef.displayName ||
          restaurantRef.brand ||
          '—',
        restaurantLocation:
          restaurantRef.location ||
          restaurantRef.address ||
          restaurantRef.area ||
          '',
        driverId: driverId ? String(driverId) : null,
        driverName:
          item.driverName ||
          driverRef.name ||
          driverRef.fullName ||
          driverRef.displayName ||
          '',
        driverStatus: driverRef.status || item.driverStatus || '',
        status,
        total: item.total || item.grandTotal || item.totalPrice || item.amount || 0,
        paymentMethod,
        paymentStatus,
        createdAt: item.createdAt || item.placedAt || item.created || null,
        updatedAt: item.updatedAt || item.modifiedAt || null,
      };
    });
};

const getOrderTimestamp = (order) => {
  const candidates = [order?.createdAt, order?.updatedAt];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
};

const sortOrdersByNewest = (orders = []) =>
  [...orders].sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a));

function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [superAdminName, setSuperAdminName] = useState('');
  const token = getAuthToken(AUTH_ROLES.SUPER_ADMIN);
  const [lastRefreshedAt] = useState(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

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
  const [driversRefreshTick, setDriversRefreshTick] = useState(0);
  const [ordersRefreshTick, setOrdersRefreshTick] = useState(0);

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

  const lastRefreshLabel = useMemo(() => formatDateTime(lastRefreshedAt), [lastRefreshedAt]);

  useEffect(() => {
    const name = localStorage.getItem('superAdminName');
    if (name) {
      setSuperAdminName(name);
    }
  }, []);

  const fetchJSON = useCallback(
    async (url, options = {}) => {
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
    },
    [token]
  );

  const handleRealtimeEvent = useCallback(
    (message) => {
      if (!message || typeof message !== 'object') return;
      const { event, payload } = message;
      if (!event) return;

      switch (event) {
        case 'order.status.changed': {
          const orderId = payload?.orderId;
          if (!orderId) return;
          let updated = false;
          setOrders((prev) => {
            const index = prev.findIndex((order) => (order.id || order._id) === orderId);
            if (index === -1) {
              return prev;
            }
            updated = true;
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: payload?.status || next[index].status,
            };
            return next;
          });
          if (!updated) {
            setOrdersRefreshTick((tick) => tick + 1);
          }
          break;
        }
        case 'order.created':
        case 'order.cancelled': {
          setOrdersRefreshTick((tick) => tick + 1);
          break;
        }
        case 'driver.approval.updated': {
          const driverId = payload?.driverId;
          if (!driverId) return;
          let updated = false;
          setDrivers((prev) => {
            const index = prev.findIndex((driver) => driver.id === driverId);
            if (index === -1) {
              return prev;
            }
            updated = true;
            const next = [...prev];
            next[index] = {
              ...next[index],
              approvalStatus: payload?.approvalStatus ?? next[index].approvalStatus,
              approvalNotes: payload?.notes ?? next[index].approvalNotes,
            };
            return next;
          });
          if (!updated) {
            setDriversRefreshTick((tick) => tick + 1);
          }
          break;
        }
        case 'driver.activity.updated': {
          const driverId = payload?.driverId;
          if (!driverId) return;
          let updated = false;
          setDrivers((prev) => {
            const index = prev.findIndex((driver) => driver.id === driverId);
            if (index === -1) {
              return prev;
            }
            updated = true;
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: payload?.status ?? next[index].status,
            };
            return next;
          });
          if (!updated) {
            setDriversRefreshTick((tick) => tick + 1);
          }
          break;
        }
        case 'driver.registered': {
          setDriversRefreshTick((tick) => tick + 1);
          break;
        }
        default:
          break;
      }
    },
    [setDriversRefreshTick, setOrdersRefreshTick]
  );

  useEffect(() => {
    if (!token) return undefined;

    const socket = io(REALTIME_URL, {
      transports: ['websocket'],
      auth: { token },
    });

    const subscribe = () => {
      socket.emit('realtime:subscribe', 'role:superAdmin');
    };

    socket.on('connect', subscribe);
    socket.on('realtime:event', handleRealtimeEvent);
    socket.on('connect_error', (error) => {
      console.error('[realtime] connection error:', error.message);
    });

    return () => {
      socket.emit('realtime:unsubscribe', 'role:superAdmin');
      socket.off('realtime:event', handleRealtimeEvent);
      socket.off('connect', subscribe);
      socket.disconnect();
    };
  }, [handleRealtimeEvent, token]);

  useEffect(() => {
    let ignore = false;
    const loadCustomers = async () => {
      setCustomerLoading(true);
      setCustomerAlert(null);
      try {
        const data = await fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/customers`);
        if (!ignore) {
          const normalized = normalizeCustomers(data);
          setCustomers(normalized);
          setCustomerAlert(
            normalized.length
              ? null
              : { type: 'info', message: 'Chưa có khách hàng nào trong hệ thống.' }
          );
        }
      } catch (error) {
        console.error('Failed to load customers:', error);
        if (!ignore) {
          setCustomers(normalizeCustomers(FALLBACK_CUSTOMERS));
          setCustomerAlert({
            type: 'warning',
            message: `Không thể tải dữ liệu khách hàng thực tế${
              error?.message ? ` (${error.message})` : ''
            }, hệ thống đang hiển thị dữ liệu mẫu để bạn tham khảo.`,
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
  }, [fetchJSON]);

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
        console.error('Failed to load restaurants:', error);
        if (!ignore) {
          setRestaurants(normalizeRestaurants(FALLBACK_RESTAURANTS));
          setRestaurantAlert({
            type: 'warning',
            message: `Không thể tải dữ liệu nhà hàng thực tế${
              error?.message ? ` (${error.message})` : ''
            }, đang hiển thị danh sách mẫu để dễ dàng đánh giá giao diện.`,
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
  }, [fetchJSON]);

  useEffect(() => {
    let ignore = false;
    const loadDrivers = async () => {
      setDriversLoading(true);
      setDriverAlert(null);
      try {
        const data = await fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/drivers`);
        if (!ignore) {
          const normalized = normalizeDrivers(data);
          setDrivers(normalized);
          setDriverAlert(
            normalized.length
              ? null
              : { type: 'info', message: 'Chưa có tài xế nào đăng ký vào hệ thống.' }
          );
        }
      } catch (error) {
        console.error('Failed to load drivers:', error);
        if (!ignore) {
          setDrivers(normalizeDrivers(FALLBACK_DRIVERS));
          setDriverAlert({
            type: 'warning',
            message: `Dịch vụ tài xế chưa phản hồi${
              error?.message ? ` (${error.message})` : ''
            }, dữ liệu mô phỏng đang được sử dụng để bạn tiếp tục tinh chỉnh giao diện.`,
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
  }, [fetchJSON, driversRefreshTick]);

  useEffect(() => {
    let ignore = false;
    const loadOrders = async () => {
      setOrdersLoading(true);
      setOrderAlert(null);
      try {
        const data = await fetchJSON(`${SUPER_ADMIN_API_URL}/api/superadmin/orders?scope=all`);
        if (!ignore) {
          const normalized = sortOrdersByNewest(normalizeOrders(data));
          setOrders(normalized);
          setOrderAlert(
            normalized.length
              ? null
              : { type: 'info', message: 'Hiện chưa có đơn hàng nào trong hệ thống.' }
          );
        }
      } catch (error) {
        console.error('Failed to load orders:', error);
        if (!ignore) {
          setOrders(sortOrdersByNewest(normalizeOrders(FALLBACK_ORDERS)));
          setOrderAlert({
            type: 'warning',
            message: `Dịch vụ đơn hàng chưa phản hồi${
              error?.message ? ` (${error.message})` : ''
            }, bảng này đang sử dụng dữ liệu mô phỏng để bạn kiểm tra luồng thao tác.`,
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
  }, [fetchJSON, ordersRefreshTick]);

  const handleLogout = () => {
    clearAuthToken(AUTH_ROLES.SUPER_ADMIN);
    localStorage.removeItem('superAdminName');
    window.location.href = '/restaurant/home';
  };

  const customerLookup = useMemo(() => {
    const map = new Map();
    customers.forEach((customer) => {
      const key = customer?.id || customer?._id;
      if (key) {
        map.set(String(key), customer);
      }
    });
    return map;
  }, [customers]);

  const restaurantLookup = useMemo(() => {
    const map = new Map();
    restaurants.forEach((restaurant) => {
      const key = restaurant?.id || restaurant?._id;
      if (key) {
        map.set(String(key), restaurant);
      }
    });
    return map;
  }, [restaurants]);

  const driverLookup = useMemo(() => {
    const map = new Map();
    drivers.forEach((driver) => {
      const key = driver?.id || driver?._id;
      if (key) {
        map.set(String(key), driver);
      }
    });
    return map;
  }, [drivers]);

  const ordersHydrated = useMemo(() => {
    if (!orders.length) return [];
    const resolveName = (existing, ...candidates) => {
      const trimmed = typeof existing === 'string' ? existing.trim() : existing;
      const value = trimmed && trimmed !== '—' ? trimmed : null;
      if (value) return value;
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim();
        }
      }
      return '—';
    };
    return orders.map((order) => {
      const customer = order.customerId ? customerLookup.get(String(order.customerId)) : null;
      const restaurant = order.restaurantId ? restaurantLookup.get(String(order.restaurantId)) : null;
      const driver = order.driverId ? driverLookup.get(String(order.driverId)) : null;
      const rawCode = order.rawCode || order.code || order.id;
      const displayCode = formatOrderCode(rawCode || order.id);
      const paymentLabel = `${formatPaymentMethod(order.paymentMethod)} • ${formatPaymentStatus(
        order.paymentStatus
      )}`;
      const driverStatusLabel = formatDriverStatus(order.driverStatus || driver?.status || '');
      return {
        ...order,
        rawCode,
        displayCode,
        paymentLabel,
        customerName: resolveName(
          order.customerName,
          customer?.name,
          customer?.fullName,
          customer?.email
        ),
        customerPhone: resolveName(
          order.customerPhone,
          customer?.phone,
          customer?.contact,
          customer?.mobile
        ),
        restaurantName: resolveName(
          order.restaurantName,
          restaurant?.name,
          restaurant?.brand,
          restaurant?.ownerName
        ),
        restaurantLocation:
          order.restaurantLocation ||
          restaurant?.location ||
          restaurant?.address ||
          restaurant?.area ||
          '',
        driverName: resolveName(order.driverName, driver?.name, driver?.fullName, driver?.email),
        driverStatus: order.driverStatus || driver?.status || '',
        driverStatusLabel,
      };
    });
  }, [orders, customerLookup, restaurantLookup, driverLookup]);

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
    if (orderStatusFilter === 'all') return ordersHydrated;
    return ordersHydrated.filter((order) => order.status === orderStatusFilter);
  }, [ordersHydrated, orderStatusFilter]);

  const overviewMetrics = useMemo(() => {
    const activeCustomers = customers.filter((customer) => customer.status === 'active').length;
    const pendingRestaurants = restaurants.filter(
      (restaurant) => restaurant.approvalStatus === 'pending'
    ).length;
    const approvedRestaurants = restaurants.filter(
      (restaurant) => restaurant.approvalStatus === 'approved'
    ).length;
    const onlineDrivers = drivers.filter((driver) => driver.status === 'online').length;
    const openOrders = ordersHydrated.filter(
      (order) => !['Delivered', 'Cancelled', 'Failed'].includes(order.status)
    ).length;
    const deliveredOrders = ordersHydrated.filter((order) => order.status === 'Delivered');
    const totalRevenue = deliveredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const cancellationRate =
      ordersHydrated.length === 0
        ? 0
        : ordersHydrated.filter((order) => order.status === 'Cancelled').length / ordersHydrated.length;

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
  }, [customers, restaurants, drivers, ordersHydrated]);

  const serviceHealth = useMemo(() => {
    const mapAlertToTone = (alert) => {
      if (!alert) return 'ok';
      if (alert.type === 'danger') return 'danger';
      if (alert.type === 'warning') return 'warning';
      return 'info';
    };

    return [
      {
        id: 'customers',
        label: 'Khách hàng',
        count: customers.length,
        loading: customerLoading,
        alert: customerAlert,
      },
      {
        id: 'restaurants',
        label: 'Nhà hàng',
        count: restaurants.length,
        loading: restaurantsLoading,
        alert: restaurantAlert,
      },
      {
        id: 'drivers',
        label: 'Tài xế',
        count: drivers.length,
        loading: driversLoading,
        alert: driverAlert,
      },
      {
        id: 'orders',
        label: 'Đơn hàng',
        count: ordersHydrated.length,
        loading: ordersLoading,
        alert: orderAlert,
      },
    ].map((item) => {
      const tone = item.loading ? 'loading' : mapAlertToTone(item.alert);
      const message = item.loading
        ? 'Đang tải dữ liệu...'
        : item.alert?.message || 'Hệ thống hoạt động ổn định.';
      return {
        ...item,
        tone,
        message,
      };
    });
  }, [
    customers.length,
    customerAlert,
    customerLoading,
    restaurants.length,
    restaurantAlert,
    restaurantsLoading,
    drivers.length,
    driverAlert,
    driversLoading,
    ordersHydrated.length,
    orderAlert,
    ordersLoading,
  ]);

  const driverSummary = useMemo(() => {
    if (drivers.length === 0) {
      return {
        total: 0,
        online: 0,
        busy: 0,
        offline: 0,
        pending: 0,
        approved: 0,
        totalTrips: 0,
        avgRating: 0,
        ratedCount: 0,
      };
    }

    const online = drivers.filter((driver) => driver.status === 'online').length;
    const busy = drivers.filter((driver) => driver.status === 'busy').length;
    const offline = drivers.filter((driver) => driver.status === 'offline').length;
    const pending = drivers.filter((driver) => driver.approvalStatus === 'pending').length;
    const approved = drivers.filter((driver) => driver.approvalStatus === 'approved').length;
    const totalTrips = drivers.reduce((sum, driver) => sum + (driver.totalTrips || 0), 0);
    const ratedDrivers = drivers.filter((driver) => typeof driver.rating === 'number');
    const avgRating =
      ratedDrivers.length === 0
        ? 0
        : ratedDrivers.reduce((sum, driver) => sum + driver.rating, 0) / ratedDrivers.length;

    return {
      total: drivers.length,
      online,
      busy,
      offline,
      pending,
      approved,
      totalTrips,
      avgRating,
      ratedCount: ratedDrivers.length,
    };
  }, [drivers]);

  const orderSummary = useMemo(() => {
    if (ordersHydrated.length === 0) {
      return {
        total: 0,
        inProgress: 0,
        delivered: 0,
        cancelled: 0,
        failed: 0,
        revenue: 0,
        avgTicket: 0,
        awaitingDriver: 0,
      };
    }

    const deliveredOrders = ordersHydrated.filter((order) => order.status === 'Delivered');
    const cancelled = ordersHydrated.filter((order) => order.status === 'Cancelled').length;
    const failed = ordersHydrated.filter((order) => order.status === 'Failed').length;
    const awaitingDriver = ordersHydrated.filter((order) => order.status === 'Awaiting Driver').length;
    const inProgress = ordersHydrated.filter((order) =>
      ['Pending Confirmation', 'Confirmed', 'Preparing', 'Awaiting Driver', 'Out for Delivery'].includes(
        order.status
      )
    ).length;
    const revenue = deliveredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const avgTicket = deliveredOrders.length ? revenue / deliveredOrders.length : 0;

    return {
      total: ordersHydrated.length,
      inProgress,
      delivered: deliveredOrders.length,
      cancelled,
      failed,
      revenue,
      avgTicket,
      awaitingDriver,
    };
  }, [ordersHydrated]);

  const customerSummary = useMemo(() => {
    if (customers.length === 0) {
      return {
        total: 0,
        active: 0,
        locked: 0,
        avgOrders: 0,
        avgSpend: 0,
        topSpender: null,
      };
    }
    const active = customers.filter((customer) => customer.status === 'active').length;
    const locked = customers.filter((customer) => customer.status === 'locked').length;
    const totalOrders = customers.reduce((sum, customer) => sum + (customer.totalOrders || 0), 0);
    const totalSpend = customers.reduce((sum, customer) => sum + (customer.lifetimeSpend || 0), 0);
    const topSpender = customers.reduce((best, customer) => {
      const spend = customer.lifetimeSpend || 0;
      if (!best || spend > (best.lifetimeSpend || 0)) {
        return customer;
      }
      return best;
    }, null);
    return {
      total: customers.length,
      active,
      locked,
      avgOrders: totalOrders / customers.length,
      avgSpend: totalSpend / customers.length,
      topSpender,
    };
  }, [customers]);

  const restaurantSummary = useMemo(() => {
    if (restaurants.length === 0) {
      return {
        total: 0,
        approved: 0,
        pending: 0,
        inactive: 0,
        avgMenus: 0,
        topCategory: '—',
      };
    }

    const approved = restaurants.filter((restaurant) => restaurant.approvalStatus === 'approved').length;
    const pending = restaurants.filter((restaurant) => restaurant.approvalStatus === 'pending').length;
    const inactive = restaurants.filter((restaurant) => restaurant.status === 'inactive').length;
    const avgMenus =
      restaurants.reduce((sum, restaurant) => sum + (restaurant.totalMenus || 0), 0) /
      restaurants.length;

    const categoryFrequency = restaurants.reduce((acc, restaurant) => {
      restaurant.categories.forEach((category) => {
        acc[category] = (acc[category] || 0) + 1;
      });
      return acc;
    }, {});

    const topCategory =
      Object.entries(categoryFrequency)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)[0] || 'Đa dạng';

    return {
      total: restaurants.length,
      approved,
      pending,
      inactive,
      avgMenus,
      topCategory,
    };
  }, [restaurants]);

  const heroHighlights = useMemo(
    () => [
      {
        id: 'orders-inflight',
        label: 'Đơn hàng đang xử lý',
        value: formatNumber(orderSummary.inProgress),
        caption: `${formatNumber(orderSummary.awaitingDriver)} đang chờ tài xế`,
        icon: '🚚',
        tone: 'primary',
      },
      {
        id: 'active-customers',
        label: 'Khách hàng hoạt động',
        value: formatNumber(customerSummary.active),
        caption: `${formatNumber(customerSummary.total)} tổng khách`,
        icon: '🧑‍💼',
        tone: 'emerald',
      },
      {
        id: 'restaurants-ready',
        label: 'Nhà hàng sẵn sàng',
        value: formatNumber(restaurantSummary.approved),
        caption: `${formatNumber(restaurantSummary.pending)} đang chờ duyệt`,
        icon: '🍽️',
        tone: 'amber',
      },
      {
        id: 'drivers-online',
        label: 'Tài xế trên tuyến',
        value: formatNumber(driverSummary.online),
        caption: `${formatNumber(driverSummary.busy)} đang giao`,
        icon: '🛵',
        tone: 'blue',
      },
    ],
    [
      orderSummary.inProgress,
      orderSummary.awaitingDriver,
      customerSummary.active,
      customerSummary.total,
      restaurantSummary.approved,
      restaurantSummary.pending,
      driverSummary.online,
      driverSummary.busy,
    ]
  );

  const quickActions = [
    {
      id: 'refresh',
      label: isRefreshing ? 'Đang làm mới...' : 'Làm mới dữ liệu',
      description: 'Lấy dữ liệu mới nhất từ các dịch vụ',
      tone: 'primary',
      disabled: isRefreshing,
      onClick: () => {
        if (!isRefreshing) {
          setIsRefreshing(true);
          setTimeout(() => {
            window.location.reload();
          }, 260);
        }
      },
    },
    {
      id: 'live-ops',
      label: 'Đi tới bảng đơn hàng',
      description: 'Giải quyết nhanh các đơn đang chờ xử lý',
      tone: 'amber',
      onClick: () => {
        setActiveTab('orders');
        setTimeout(() => {
          const element = document.querySelector('.sa-section-orders');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 120);
      },
    },
    {
      id: 'report',
      label: 'In báo cáo nhanh',
      description: 'Chụp ảnh bảng điều khiển hiện tại',
      tone: 'emerald',
      onClick: () => {
        setActiveTab('reports');
        setTimeout(() => {
          window.print();
        }, 320);
      },
    },
  ];

  const renderSidebar = () => (
    <aside className="sa-sidebar">
      <section className="sa-sidebar-section profile">
        <div>
          <span className="sa-sidebar-overline">BẢNG ĐIỀU PHỐI</span>
          <h2>
            Xin chào, <strong>{superAdminName || 'Super Admin'}</strong>
          </h2>
          <p className="sa-sidebar-meta">Cập nhật gần nhất: {lastRefreshLabel}</p>
        </div>
        <div className="sa-sidebar-metrics">
          <div>
            <span>Đơn mở</span>
            <strong>{overviewMetrics.openOrders}</strong>
          </div>
          <div>
            <span>Tài xế online</span>
            <strong>{driverSummary.online}</strong>
          </div>
          <div>
            <span>Doanh thu (đã giao)</span>
            <strong>{formatCurrency(orderSummary.revenue || 0)}</strong>
          </div>
        </div>
      </section>
      <section className="sa-sidebar-section nav">
        <h3>Mục quản trị</h3>
        <nav className="sa-sidebar-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`sa-tab ${activeTab === tab.id ? 'active' : ''}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="sa-tab-main">
                <span className="sa-tab-icon">{SECTION_ICONS[tab.id] || '•'}</span>
                <span className="sa-tab-label">{tab.label}</span>
              </span>
              <span className="sa-tab-indicator">›</span>
            </button>
          ))}
        </nav>
      </section>
      <section className="sa-sidebar-section health">
        <h3>Trạng thái dịch vụ</h3>
        <ul className="sa-sidebar-status">
          {serviceHealth.map((item) => (
            <li key={item.id} className={`tone-${item.tone}`}>
              <div className="sa-sidebar-status-header">
                <span>{item.label}</span>
                <strong>
                  {item.loading ? '—' : new Intl.NumberFormat('vi-VN').format(item.count)}
                </strong>
              </div>
              <p>{item.message}</p>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );

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
    const settled = ordersHydrated.filter(
      (order) =>
        ['Completed', 'Delivered'].includes(order.status) && order.financialSummary
    );

    const totals = settled.reduce(
      (acc, order) => {
        const summary = order.financialSummary || {};
        acc.totalOrders += 1;
        acc.grossItems += Number(summary.grossItems || 0);
        acc.shippingFee += Number(summary.shippingFee || 0);
        acc.platformCommission += Number(summary.commissionAmount || 0);
        acc.maintenanceFee += Number(summary.maintenanceFee || 0);
        acc.restaurantShippingShare += Number(summary.restaurantShippingShare || 0);
        acc.driverShipping += Number(summary.driverPayout || 0);
        acc.restaurantNet += Number(summary.netRestaurant || 0);
        return acc;
      },
      {
        totalOrders: 0,
        grossItems: 0,
        shippingFee: 0,
        platformCommission: 0,
        maintenanceFee: 0,
        restaurantShippingShare: 0,
        driverShipping: 0,
        restaurantNet: 0,
      }
    );

    const platformRevenue = totals.platformCommission + totals.maintenanceFee;
    const restaurantItemShare = Math.max(0, totals.grossItems - totals.platformCommission);
    const totalRevenue = totals.grossItems + totals.shippingFee;

    return {
      totalOrders: totals.totalOrders,
      totalRevenue,
      grossItems: totals.grossItems,
      shippingFee: totals.shippingFee,
      platformCommission: totals.platformCommission,
      maintenanceFee: totals.maintenanceFee,
      platformRevenue,
      restaurantItemShare,
      restaurantShippingShare: totals.restaurantShippingShare,
      driverShipping: totals.driverShipping,
      restaurantNet: totals.restaurantNet,
    };
  }, [ordersHydrated]);

  const renderAlert = (alert) =>
    alert ? (
      <div className={`sa-banner ${alert.type || 'info'}`}>
        <span className="sa-banner-icon">{ALERT_ICONS[alert.type] || ALERT_ICONS.info}</span>
        <span className="sa-banner-badge">
          {alert.type === 'warning'
            ? 'Chế độ demo'
            : alert.type === 'danger'
            ? 'Cảnh báo'
            : 'Thông tin'}
        </span>
        <span className="sa-banner-message">{alert.message || alert}</span>
      </div>
    ) : null;

  const renderHero = () => (
    <section className="sa-hero">
      <div className="sa-hero-intro">
        <span className="sa-sidebar-overline">Trung tâm điều hành</span>
        <h2>Nhịp độ vận hành theo thời gian thực</h2>
        <p>
          Theo dõi sức khỏe toàn hệ thống, giải quyết nhanh các điểm nghẽn và chủ động duy trì trải
          nghiệm giao đồ ăn mượt mà cho khách hàng.
        </p>
        <div className="sa-hero-actions">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`sa-button glass tone-${action.tone}`}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              <span>{action.label}</span>
              <small>{action.description}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="sa-hero-grid">
        {heroHighlights.map((item) => (
          <article key={item.id} className={`sa-hero-card tone-${item.tone}`}>
            <div className="sa-hero-card-icon">{item.icon}</div>
            <div className="sa-hero-card-body">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.caption}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  const renderOverview = () => (
    <section className="sa-section">
      <div className="sa-grid metrics">
        <div className="sa-card metric">
          <h3>
            <span className="sa-icon">{SECTION_ICONS.customers}</span>Khách hàng
          </h3>
          <p className="sa-highlight">{overviewMetrics.totalCustomers}</p>
          <span>{overviewMetrics.activeCustomers} đang hoạt động</span>
        </div>
        <div className="sa-card metric">
          <h3>
            <span className="sa-icon">{SECTION_ICONS.restaurants}</span>Nhà hàng
          </h3>
          <p className="sa-highlight">{overviewMetrics.totalRestaurants}</p>
          <span>{overviewMetrics.pendingRestaurants} chờ duyệt</span>
        </div>
        <div className="sa-card metric">
          <h3>
            <span className="sa-icon">{SECTION_ICONS.drivers}</span>Tài xế
          </h3>
          <p className="sa-highlight">{overviewMetrics.totalDrivers}</p>
          <span>{overviewMetrics.onlineDrivers} đang online</span>
        </div>
        <div className="sa-card metric">
          <h3>
            <span className="sa-icon">{SECTION_ICONS.orders}</span>Đơn hàng mở
          </h3>
          <p className="sa-highlight">{overviewMetrics.openOrders}</p>
          <span>Doanh thu: {formatCurrency(overviewMetrics.totalRevenue)}</span>
        </div>
        <div className="sa-card metric">
          <h3>
            <span className="sa-icon">{SECTION_ICONS.reports}</span>Tỷ lệ hủy
          </h3>
          <p className="sa-highlight">
            {(overviewMetrics.cancellationRate * 100).toFixed(1)}%
          </p>
          <span>Duy trì dưới 5% để đảm bảo SLA</span>
        </div>
      </div>
    </section>
  );

  const renderCustomers = () => {
    const averageOrders = customerSummary.total ? customerSummary.avgOrders.toFixed(1) : '0.0';
    const averageSpend = customerSummary.total ? formatCurrency(customerSummary.avgSpend) : '—';
    const topSpenderName = customerSummary.topSpender?.name || '—';
    const topSpenderSpend = customerSummary.topSpender
      ? formatCurrency(customerSummary.topSpender.lifetimeSpend || 0)
      : '—';
    const lockedRate = customerSummary.total
      ? ((customerSummary.locked / customerSummary.total) * 100).toFixed(1)
      : '0.0';

    return (
      <section className="sa-section">
        <header className="sa-section-header">
          <div>
            <h2>
              <span className="sa-icon">{SECTION_ICONS.customers}</span>Quản lý khách hàng
            </h2>
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
            <div className="sa-filter">
              <span>Trạng thái</span>
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
          </div>
        </header>
        {renderAlert(customerAlert)}
        <div className="sa-subsection-metrics">
          <div className="sa-mini-card">
            <span>Tổng khách hàng</span>
            <strong>{customerSummary.total}</strong>
            <small>{customerSummary.active} đang hoạt động</small>
          </div>
          <div className="sa-mini-card danger">
            <span>Tài khoản khóa</span>
            <strong>{customerSummary.locked}</strong>
            <small>Tỷ lệ {lockedRate}%</small>
          </div>
          <div className="sa-mini-card accent">
            <span>Số đơn trung bình</span>
            <strong>{averageOrders}</strong>
            <small>Chi tiêu TB {averageSpend}</small>
          </div>
          <div className="sa-mini-card">
            <span>Khách hàng nổi bật</span>
            <strong>{topSpenderName}</strong>
            <small>Chi tiêu {topSpenderSpend}</small>
          </div>
        </div>
        {customerLoading ? (
          <p className="sa-placeholder">Đang tải dữ liệu khách hàng...</p>
        ) : filteredCustomers.length === 0 ? (
          <div className="sa-empty">
            <h3>Không tìm thấy khách hàng</h3>
            <p>Thử điều chỉnh bộ lọc hoặc kiểm tra lại dữ liệu hệ thống.</p>
          </div>
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
                    <td className="sa-number">{customer.totalOrders}</td>
                    <td>{formatCurrency(customer.lifetimeSpend)}</td>
                    <td>
                      <span className={`sa-status ${customer.status}`}>
                        {customer.status === 'active' ? 'Đang hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                    <td>
                      <span className="sa-meta">{formatDateTime(customer.createdAt)}</span>
                    </td>
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
  };

  const renderRestaurants = () => {
    const averageMenus = restaurantSummary.total ? restaurantSummary.avgMenus.toFixed(1) : '0.0';

    return (
      <section className="sa-section">
        <header className="sa-section-header">
          <div>
            <h2>
              <span className="sa-icon">{SECTION_ICONS.restaurants}</span>Quản lý nhà hàng
            </h2>
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
            <div className="sa-filter">
              <span>Trạng thái</span>
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
          </div>
        </header>
        {renderAlert(restaurantAlert)}
        <div className="sa-subsection-metrics">
          <div className="sa-mini-card">
            <span>Tổng nhà hàng</span>
            <strong>{restaurantSummary.total}</strong>
            <small>{restaurantSummary.approved} đã duyệt</small>
          </div>
          <div className="sa-mini-card warning">
            <span>Chờ xử lý</span>
            <strong>{restaurantSummary.pending}</strong>
            <small>{restaurantSummary.inactive} tạm dừng</small>
          </div>
          <div className="sa-mini-card accent">
            <span>Số món trung bình</span>
            <strong>{averageMenus}</strong>
            <small>Danh mục nổi bật {restaurantSummary.topCategory}</small>
          </div>
          <div className="sa-mini-card">
            <span>Truy cập nhanh</span>
            <strong>Thực đơn</strong>
            <small>Mở chi tiết trực tiếp trong bảng</small>
          </div>
        </div>
        {restaurantsLoading ? (
          <p className="sa-placeholder">Đang tải dữ liệu nhà hàng...</p>
        ) : filteredRestaurants.length === 0 ? (
          <div className="sa-empty">
            <h3>Không có nhà hàng nào phù hợp bộ lọc</h3>
            <p>Thử thay đổi điều kiện lọc hoặc kiểm tra dịch vụ nhà hàng.</p>
          </div>
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
                    <td className="sa-number">{restaurant.totalMenus}</td>
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
                  <p className="sa-placeholder">Đang tải thực đơn...</p>
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
  };

  const renderDrivers = () => {
    const averageRating =
      driverSummary.ratedCount > 0 ? driverSummary.avgRating.toFixed(1) : '—';

    return (
      <section className="sa-section sa-section-drivers">
        <header className="sa-section-header">
          <div>
            <h2>
              <span className="sa-icon">{SECTION_ICONS.drivers}</span>Quản lý tài xế
            </h2>
            <p>Phê duyệt hồ sơ, theo dõi trạng thái và hiệu suất giao hàng.</p>
          </div>
          <div className="sa-filter">
            <span>Trạng thái</span>
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
          </div>
        </header>
        {renderAlert(driverAlert)}
        <div className="sa-subsection-metrics">
          <div className="sa-mini-card">
            <span>Tổng tài xế</span>
            <strong>{driverSummary.total}</strong>
            <small>{driverSummary.approved} đã duyệt</small>
          </div>
          <div className="sa-mini-card success">
            <span>Đang online</span>
            <strong>{driverSummary.online}</strong>
            <small>{driverSummary.busy} đang giao</small>
          </div>
          <div className="sa-mini-card neutral">
            <span>Ngoại tuyến</span>
            <strong>{driverSummary.offline}</strong>
            <small>{driverSummary.pending} chờ duyệt</small>
          </div>
          <div className="sa-mini-card accent">
            <span>Hiệu suất</span>
            <strong>{driverSummary.totalTrips}</strong>
            <small>Đánh giá TB {averageRating}</small>
          </div>
        </div>
        {driversLoading ? (
          <p className="sa-placeholder">Đang tải dữ liệu tài xế...</p>
        ) : filteredDrivers.length === 0 ? (
          <div className="sa-empty">
            <h3>Không tìm thấy tài xế phù hợp</h3>
            <p>Thay đổi bộ lọc hoặc kiểm tra kết nối dịch vụ tài xế để tiếp tục.</p>
          </div>
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
                    <td className="sa-number">{driver.totalTrips}</td>
                    <td className="sa-number">{Math.round((driver.acceptanceRate || 0) * 100)}%</td>
                    <td className="sa-number">
                      {typeof driver.rating === 'number' ? driver.rating.toFixed(1) : '—'}
                    </td>
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
  };

  const renderOrders = () => {
    const statusHighlights = [
      'Pending Confirmation',
      'Awaiting Driver',
      'Out for Delivery',
      'Delivered',
      'Cancelled',
    ]
      .map((status) => ({
        status,
        label: ORDER_STATUS_LABELS[status] || status,
        count: ordersHydrated.filter((order) => order.status === status).length,
      }))
      .filter((item) => item.count > 0);

    return (
      <section className="sa-section sa-section-orders">
        <header className="sa-section-header">
          <div>
            <h2>
              <span className="sa-icon">{SECTION_ICONS.orders}</span>Quản lý đơn hàng
            </h2>
            <p>Theo dõi, lọc và can thiệp thủ công vào đơn hàng toàn hệ thống.</p>
          </div>
          <div className="sa-filter">
            <span>Trạng thái</span>
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
          </div>
        </header>
        {renderAlert(orderAlert)}
        <div className="sa-subsection-metrics">
          <div className="sa-mini-card">
            <span>Tổng đơn</span>
            <strong>{orderSummary.total}</strong>
            <small>{orderSummary.inProgress} đang xử lý</small>
          </div>
          <div className="sa-mini-card success">
            <span>Đã giao</span>
            <strong>{orderSummary.delivered}</strong>
            <small>Doanh thu {formatCurrency(orderSummary.revenue || 0)}</small>
          </div>
          <div className="sa-mini-card danger">
            <span>Hủy & Thất bại</span>
            <strong>{orderSummary.cancelled + orderSummary.failed}</strong>
            <small>
              {orderSummary.cancelled} hủy • {orderSummary.failed} lỗi
            </small>
          </div>
          <div className="sa-mini-card accent">
            <span>Chờ tài xế</span>
            <strong>{orderSummary.awaitingDriver}</strong>
            <small>
              Giá trị TB{' '}
              {orderSummary.avgTicket ? formatCurrency(orderSummary.avgTicket) : '—'}
            </small>
          </div>
        </div>
        {statusHighlights.length > 0 && (
          <div className="sa-chip-row">
            {statusHighlights.map((item) => (
              <span
                key={item.status}
                className={`sa-chip status-${item.status.replace(/\s+/g, '-').toLowerCase()}`}
              >
                <strong>{item.count}</strong> {item.label}
              </span>
            ))}
          </div>
        )}
        {ordersLoading ? (
          <p className="sa-placeholder">Đang tải dữ liệu đơn hàng...</p>
        ) : filteredOrders.length === 0 ? (
          <div className="sa-empty">
            <h3>Không có đơn hàng phù hợp bộ lọc</h3>
            <p>Điều chỉnh trạng thái hoặc kiểm tra lại kết nối dịch vụ đơn hàng.</p>
          </div>
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
                    <td className="sa-mono">
                      <div className="sa-stack">
                        <strong>{order.displayCode}</strong>
                        {order.rawCode && order.rawCode !== order.displayCode && (
                          <span className="sa-meta">{order.rawCode}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="sa-stack">
                        <strong>{order.customerName}</strong>
                        {order.customerPhone && order.customerPhone !== '—' && (
                          <span className="sa-meta">{order.customerPhone}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="sa-stack">
                        <strong>{order.restaurantName}</strong>
                        {order.restaurantLocation && (
                          <span className="sa-meta">{order.restaurantLocation}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="sa-stack">
                        <strong>{order.driverName || 'Đang phân công'}</strong>
                        {order.driverStatusLabel && (
                          <span className="sa-meta">{`Trạng thái: ${order.driverStatusLabel}`}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="sa-stack">
                        <strong>{formatCurrency(order.total)}</strong>
                        <span className="sa-meta">{order.paymentLabel}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`sa-status badge ${order.status
                          .replace(/\s+/g, '-')
                          .toLowerCase()}`}
                      >
                        {ORDER_STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                    <td>
                      <span className="sa-meta">{formatDateTime(order.createdAt)}</span>
                    </td>
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
  };

  const renderFinance = () => (
    <section className="sa-section">
      <header className="sa-section-header">
        <div>
          <h2>
            <span className="sa-icon">{SECTION_ICONS.finance}</span>Đối soát & Tài chính
          </h2>
          <p>Phân tách dòng tiền theo tỷ lệ 80/20 món ăn và 90/10 phí giao hàng.</p>
        </div>
      </header>
      <div className="sa-grid finance">
        <div className="sa-card">
          <h3>Tổng giá trị đã đối soát</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.totalRevenue)}</p>
          <span>{financialSummary.totalOrders} đơn hoàn tất</span>
        </div>
        <div className="sa-card">
          <h3>Giá trị món ăn</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.grossItems)}</p>
          <span>80% chuyển cho nhà hàng · 20% cho nền tảng</span>
        </div>
        <div className="sa-card">
          <h3>Hoa hồng nền tảng (20%)</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.platformCommission)}</p>
          <span>Phí duy trì: {formatCurrency(financialSummary.maintenanceFee)}</span>
        </div>
        <div className="sa-card">
          <h3>Nhà hàng nhận từ món ăn</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.restaurantItemShare)}</p>
          <span>Chưa trừ phí duy trì định kỳ</span>
        </div>
        <div className="sa-card">
          <h3>Phí giao hàng thu được</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.shippingFee)}</p>
          <span>Chia 90% tài xế · 10% thưởng nhà hàng</span>
        </div>
        <div className="sa-card">
          <h3>Chi cho tài xế (90% ship)</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.driverShipping)}</p>
        </div>
        <div className="sa-card">
          <h3>Nhà hàng hưởng (10% ship)</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.restaurantShippingShare)}</p>
        </div>
        <div className="sa-card stretch">
          <h3>Nhà hàng nhận ròng</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.restaurantNet)}</p>
          <span>= 80% món - 20% hoa hồng - phí duy trì + 10% phí ship</span>
        </div>
        <div className="sa-card stretch">
          <h3>Thu ròng nền tảng</h3>
          <p className="sa-highlight">{formatCurrency(financialSummary.platformRevenue)}</p>
          <span>Hoa hồng món ăn + phí duy trì</span>
        </div>
      </div>
      <div className="sa-card note">
        <h4>Dòng tiền & ví nội bộ</h4>
        <p>
          Số liệu lấy từ ledger: tiền món vào ví nền tảng, hoa hồng chuyển sang ví doanh thu,
          90% phí ship về ví tài xế, 10% phí ship cộng vào ví công nợ nhà hàng. Báo cáo đối soát
          dùng các số dư này để lập lịch payout.
        </p>
      </div>
    </section>
  );

  const renderPromotions = () => (
    <section className="sa-section">
      <header className="sa-section-header">
        <div>
            <h2>
              <span className="sa-icon">{SECTION_ICONS.promotions}</span>Quản lý khuyến mãi
            </h2>
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
        const count = ordersHydrated.filter((order) => order.status === option.value).length;
        const ratio = ordersHydrated.length ? Math.round((count / ordersHydrated.length) * 100) : 0;
        return { label: option.label, ratio };
      }
    );

    return (
      <section className="sa-section">
        <header className="sa-section-header">
          <div>
            <h2>
              <span className="sa-icon">{SECTION_ICONS.reports}</span>Báo cáo & Phân tích
            </h2>
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
          <p>Điều phối toàn bộ hệ sinh thái giao đồ ăn trong một bảng điều khiển thống nhất.</p>
          <div className="sa-header-meta">
            <span className="sa-pill">Cập nhật {lastRefreshLabel}</span>
            <span className="sa-pill">Đơn mở: {overviewMetrics.openOrders}</span>
            <span className="sa-pill">Tài xế online: {driverSummary.online}</span>
          </div>
        </div>
        <button className="sa-button logout" onClick={handleLogout}>
          Đăng xuất
        </button>
      </header>
      <div className="sa-shell">
        {renderSidebar()}
        <main className="sa-main sa-content">
          {renderHero()}
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default SuperAdminDashboard;
