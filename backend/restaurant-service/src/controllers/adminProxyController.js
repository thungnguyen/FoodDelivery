import fetch from 'node-fetch';

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || process.env.AUTH_SERVICE_BASE_URL || 'http://localhost:4000';
const DELIVERY_SERVICE_URL =
  process.env.DELIVERY_SERVICE_URL || process.env.DELIVERY_SERVICE_BASE_URL || 'http://localhost:5003';
const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || process.env.ORDER_SERVICE_BASE_URL || 'http://localhost:5005';
const SERVICE_INTERNAL_KEY = process.env.SERVICE_INTERNAL_KEY || 'super-admin-internal-key';

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
    const data = await forward(req, `${AUTH_SERVICE_URL}/api/auth/admin/customers`);
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
      `${AUTH_SERVICE_URL}/api/auth/admin/customers/${req.params.id}/status`,
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
    const data = await forward(req, `${DELIVERY_SERVICE_URL}/api/admin/drivers`);
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
      `${DELIVERY_SERVICE_URL}/api/admin/drivers/${req.params.id}/status`,
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
      `${DELIVERY_SERVICE_URL}/api/admin/drivers/${req.params.id}/activity`,
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

const buildQueryString = (query) => {
  const qs = new URLSearchParams(query || {}).toString();
  return qs ? `?${qs}` : '';
};

export const proxyListOrders = async (req, res) => {
  try {
    const queryString = buildQueryString(req.query);
    const data = await forward(req, `${ORDER_SERVICE_URL}/api/orders${queryString}`);
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
      `${ORDER_SERVICE_URL}/api/orders/${req.params.id}/status`,
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

