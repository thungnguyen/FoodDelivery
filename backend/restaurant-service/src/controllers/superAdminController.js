import Restaurant from '../models/Restaurant.js';
import { sendEmail } from '../utils/emailService.js';

// Get all restaurants (Super Admin only)
export const getAllRestaurants = async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({ message: 'Access denied, only Super Admin can access this resource' });
    }

    const restaurants = await Restaurant.find().sort({ createdAt: -1 });
    res.status(200).json(restaurants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get a specific restaurant by ID (Super Admin only)
export const getRestaurantById = async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({ message: 'Access denied, only Super Admin can access this resource' });
    }

    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    res.status(200).json(restaurant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Delete a restaurant (Super Admin only)
export const deleteRestaurant = async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({ message: 'Access denied, only Super Admin can access this resource' });
    }

    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    // Delete associated food items here (if needed)
    // await FoodItem.deleteMany({ restaurant: restaurant._id });

    await restaurant.deleteOne();
    res.status(200).json({ message: 'Restaurant deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Update restaurant details (Super Admin only)
export const updateRestaurant = async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({ message: 'Access denied, only Super Admin can update restaurants' });
    }

    const { id } = req.params;
    const updates = req.body;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    const allowedFields = ['name', 'ownerName', 'location', 'contactNumber', 'approvalNotes'];
    allowedFields.forEach((field) => {
      if (typeof updates[field] !== 'undefined') {
        restaurant[field] = updates[field];
      }
    });

    if (typeof updates.availability === 'boolean') {
      restaurant.availability = updates.availability;
    }

    await restaurant.save();

    res.status(200).json({ message: 'Restaurant updated successfully', restaurant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const ensureSuperAdmin = (user) => user && user.role === 'superAdmin';

export const approveRestaurant = async (req, res) => {
  try {
    if (!ensureSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Access denied, only Super Admin can approve restaurants' });
    }

    const { id } = req.params;
    const { notes } = req.body;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    restaurant.approvalStatus = 'approved';
    restaurant.approvalNotes = notes || restaurant.approvalNotes || '';
    restaurant.approvedAt = new Date();
    restaurant.rejectedAt = null;
    restaurant.lastReviewedBy = req.user.id;
    restaurant.availability = true;

    await restaurant.save();

    if (restaurant.admin?.email) {
      const html = `
        <h2>Chúc mừng! Hồ sơ nhà hàng của bạn đã được phê duyệt 🎉</h2>
        <p>Nhà hàng: <strong>${restaurant.name}</strong></p>
        <p>Bạn có thể đăng nhập và bắt đầu hoạt động ngay lập tức.</p>
        ${restaurant.approvalNotes ? `<p><strong>Lưu ý từ đội vận hành:</strong> ${restaurant.approvalNotes}</p>` : ''}
      `;
      const textLines = [
        'Chúc mừng, hồ sơ nhà hàng của bạn đã được phê duyệt.',
        `Nhà hàng: ${restaurant.name}`,
      ];
      if (restaurant.approvalNotes) {
        textLines.push(`Lưu ý: ${restaurant.approvalNotes}`);
      }
      await sendEmail({
        to: restaurant.admin.email,
        subject: 'Hồ sơ nhà hàng đã được phê duyệt',
        html,
        text: textLines.join('\n'),
      }).catch((err) => console.error('Failed to send restaurant approval email:', err.message));
    }

    res.status(200).json({ message: 'Restaurant approved successfully', restaurant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const rejectRestaurant = async (req, res) => {
  try {
    if (!ensureSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Access denied, only Super Admin can reject restaurants' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    restaurant.approvalStatus = 'rejected';
    restaurant.approvalNotes = reason || '';
    restaurant.rejectedAt = new Date();
    restaurant.lastReviewedBy = req.user.id;
    restaurant.availability = false;

    await restaurant.save();

    if (restaurant.admin?.email) {
      const html = `
        <h2>Rất tiếc, hồ sơ nhà hàng của bạn chưa thể được phê duyệt</h2>
        <p>Nhà hàng: <strong>${restaurant.name}</strong></p>
        <p>Vui lòng cập nhật lại thông tin và gửi lại yêu cầu.</p>
        ${reason ? `<p><strong>Lý do:</strong> ${reason}</p>` : ''}
      `;
      const textLines = [
        'Hồ sơ nhà hàng của bạn chưa thể được phê duyệt.',
        `Nhà hàng: ${restaurant.name}`,
      ];
      if (reason) {
        textLines.push(`Lý do: ${reason}`);
      }
      await sendEmail({
        to: restaurant.admin.email,
        subject: 'Hồ sơ nhà hàng chưa được phê duyệt',
        html,
        text: textLines.join('\n'),
      }).catch((err) => console.error('Failed to send restaurant rejection email:', err.message));
    }

    res.status(200).json({ message: 'Restaurant rejected', restaurant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
