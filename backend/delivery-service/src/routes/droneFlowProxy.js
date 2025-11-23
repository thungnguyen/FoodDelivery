import express from 'express';

const router = express.Router();

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:5005';
const SERVICE_KEY = process.env.SERVICE_INTERNAL_KEY || 'super-admin-internal-key';

const forward = (path) => async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const response = await fetch(`${ORDER_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': SERVICE_KEY,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
      body: JSON.stringify(req.body || {}),
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[delivery-service] Failed to forward drone event', error);
    res.status(500).json({ message: 'Failed to forward drone request to order service' });
  }
};

router.post('/api/admin/drone/assign', forward('/api/admin/drone/assign'));
router.post('/api/drone/arrived-restaurant', forward('/api/drone/arrived-restaurant'));
router.post('/api/order/drone-pickup', forward('/api/order/drone-pickup'));
router.post('/api/drone/arrived-customer', forward('/api/drone/arrived-customer'));
router.post('/api/drone/return', forward('/api/drone/return'));
router.post('/api/admin/drone-force-return', forward('/api/admin/drone-force-return'));
router.post('/api/admin/drone-cancel', forward('/api/admin/drone-cancel'));

export default router;
