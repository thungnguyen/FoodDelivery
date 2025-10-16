import fetch from 'node-fetch';

const stripTrailingSlash = (value = '') => value.replace(/\/+$/, '');
const stripPathSuffix = (value, suffix) => {
  if (!value || !suffix) return stripTrailingSlash(value);
  const normalizedValue = stripTrailingSlash(value);
  const normalizedSuffix = stripTrailingSlash(suffix);
  if (!normalizedSuffix.length) return normalizedValue;
  if (normalizedValue.endsWith(normalizedSuffix)) {
    return normalizedValue.slice(0, normalizedValue.length - normalizedSuffix.length);
  }
  return normalizedValue;
};

const normalizeBaseUrl = (rawValue, fallback, suffixes = []) => {
  let base = stripTrailingSlash(rawValue || fallback);
  suffixes.forEach((suffix) => {
    base = stripPathSuffix(base, suffix);
  });
  return stripTrailingSlash(base);
};

const joinUrl = (base, path) => {
  const normalizedBase = stripTrailingSlash(base || '');
  if (!path) return normalizedBase;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const AUTH_SERVICE_BASE = normalizeBaseUrl(
  process.env.AUTH_SERVICE_URL || process.env.AUTH_SERVICE_BASE_URL,
  'http://localhost:4000',
  ['/api/auth', '/api']
);
const AUTH_CUSTOMERS_URL = joinUrl(AUTH_SERVICE_BASE, '/api/auth/admin/customers');

const DELIVERY_SERVICE_BASE = normalizeBaseUrl(
  process.env.DELIVERY_SERVICE_URL || process.env.DELIVERY_SERVICE_BASE_URL,
  'http://localhost:5003',
  ['/api/admin/drivers', '/api/admin', '/api']
);
const DELIVERY_DRIVERS_URL = joinUrl(DELIVERY_SERVICE_BASE, '/api/admin/drivers');

const ORDER_SERVICE_BASE = normalizeBaseUrl(
  process.env.ORDER_SERVICE_URL || process.env.ORDER_SERVICE_BASE_URL,
  'http://localhost:5005',
  ['/api/orders', '/api']
);
const ORDER_ORDERS_URL = joinUrl(ORDER_SERVICE_BASE, '/api/orders');

const SERVICE_INTERNAL_KEY = process.env.SERVICE_INTERNAL_KEY || 'super-admin-internal-key';

const buildQueryString = (query) => {
  const qs = new URLSearchParams(query || {}).toString();
  return qs ? `?${qs}` : '';
};

const ensureServiceKey = () => {
  if (!SERVICE_INTERNAL_KEY) {
    console.warn(
      '[adminProxy] SERVICE_INTERNAL_KEY is not configured. Falling back to Authorization forwarding only.'
    );
  }
};

const forward = async (req, url, options = {}) => {
  ensureServiceKey();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (SERVICE_INTERNAL_KEY) {
    headers['x-service-key'] = SERVICE_INTERNAL_KEY;
  }

  const authHeader = req.headers.authorization;
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const bodyText = await response.text();
  let payload = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    payload = bodyText;
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && payload.message) ||
      `Upstream error (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

export const proxyListCustomers = async (req, res) => {
  try {
    const data = await forward(req, `${AUTH_CUSTOMERS_URL}${buildQueryString(req.query)}`);
    res.json(data);
  } catch (error) {
    console.error('proxyListCustomers error:', error.message);
    res
      .status(error.status || 500)
      .json({ message: error.message || 'Không thể tải danh sách khách hàng' });
  }
};

export const proxyUpdateCustomerStatus = async (req, res) => {
  try {
    const data = await forward(
      req,
      joinUrl(AUTH_CUSTOMERS_URL, `/${req.params.id}/status`),
      {
        method: 'PATCH',
        body: JSON.stringify(req.body),
      }
    );
    res.json(data);
  } catch (error) {
    console.error('proxyUpdateCustomerStatus error:', error.message);
    res
      .status(error.status || 500)
      .json({ message: error.message || 'Không thể cập nhật trạng thái khách hàng' });
  }
};

export const proxyListDrivers = async (req, res) => {
  try {
    const data = await forward(req, `${DELIVERY_DRIVERS_URL}${buildQueryString(req.query)}`);
    res.json(data);
  } catch (error) {
    console.error('proxyListDrivers error:', error.message);
    res
      .status(error.status || 500)
      .json({ message: error.message || 'Không thể tải danh sách tài xế' });
  }
};

export const proxyUpdateDriverStatus = async (req, res) => {
  try {
    const data = await forward(
      req,
      joinUrl(DELIVERY_DRIVERS_URL, `/${req.params.id}/status`),
      {
        method: 'PATCH',
        body: JSON.stringify(req.body),
      }
    );
    res.json(data);
  } catch (error) {
    console.error('proxyUpdateDriverStatus error:', error.message);
    res
      .status(error.status || 500)
      .json({ message: error.message || 'Không thể cập nhật trạng thái tài xế' });
  }
};

export const proxyUpdateDriverActivity = async (req, res) => {
  try {
    const data = await forward(
      req,
      joinUrl(DELIVERY_DRIVERS_URL, `/${req.params.id}/activity`),
      {
        method: 'PATCH',
        body: JSON.stringify(req.body),
      }
    );
    res.json(data);
  } catch (error) {
    console.error('proxyUpdateDriverActivity error:', error.message);
    res
      .status(error.status || 500)
      .json({ message: error.message || 'Không thể cập nhật trạng thái hoạt động của tài xế' });
  }
};

export const proxyListOrders = async (req, res) => {
  try {
    const queryString = buildQueryString(req.query);
    const data = await forward(req, `${ORDER_ORDERS_URL}${queryString}`);
    res.json(data);
  } catch (error) {
    console.error('proxyListOrders error:', error.message);
    res
      .status(error.status || 500)
      .json({ message: error.message || 'Không thể tải danh sách đơn hàng' });
  }
};

export const proxyUpdateOrderStatus = async (req, res) => {
  try {
    const data = await forward(
      req,
      joinUrl(ORDER_ORDERS_URL, `/${req.params.id}/status`),
      {
        method: 'PATCH',
        body: JSON.stringify(req.body),
      }
    );
    res.json(data);
  } catch (error) {
    console.error('proxyUpdateOrderStatus error:', error.message);
    res
      .status(error.status || 500)
      .json({ message: error.message || 'Không thể cập nhật trạng thái đơn hàng' });
  }
};

