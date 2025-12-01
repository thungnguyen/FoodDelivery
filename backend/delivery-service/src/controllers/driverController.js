import Driver from '../models/Driver.js';
import { sendEmail } from '../utils/emailService.js';
import emitEvent from '../utils/eventBus.js';

const DEFAULT_ADMIN_EMAILS = ['thanhhungnguyen8204@gmail.com', 'thanhhunggpt@gmail.com'];

const ADMIN_EMAILS = (process.env.ADMIN_NOTIFICATION_EMAILS || DEFAULT_ADMIN_EMAILS.join(','))
  .split(',')
  .map((addr) => addr.trim())
  .filter(Boolean);

const formatDriver = (driver) => ({
  id: driver._id,
  fullName: driver.fullName,
  email: driver.email,
  phone: driver.phone,
  vehicleType: driver.vehicleType,
  licenseNumber: driver.licenseNumber,
  address: driver.address,
  documents: driver.documents,
  approvalStatus: driver.approvalStatus,
  status: driver.status,
  approvalNotes: driver.approvalNotes,
  approvedAt: driver.approvedAt,
  rejectedAt: driver.rejectedAt,
  createdAt: driver.createdAt,
  updatedAt: driver.updatedAt,
});

const notifyAdminsAboutNewDriver = async (driver) => {
  if (!ADMIN_EMAILS.length) {
    return;
  }

  const dashboardUrl =
    process.env.SUPER_ADMIN_PORTAL_URL || 'http://26.32.188.49:3000/super-admin/dashboard';

  const html = `
    <h2>Hồ sơ tài xế mới đang chờ duyệt</h2>
    <p><strong>Họ tên:</strong> ${driver.fullName}</p>
    <p><strong>Email:</strong> ${driver.email}</p>
    <p><strong>Số điện thoại:</strong> ${driver.phone}</p>
    <p><strong>Loại phương tiện:</strong> ${driver.vehicleType}</p>
    <p><strong>Biển số/GPLX:</strong> ${driver.licenseNumber}</p>
    <p>Đăng nhập trang quản trị để phê duyệt: <a href="${dashboardUrl}">${dashboardUrl}</a></p>
  `;
  const text = [
    'Có một tài xế mới đăng ký trên hệ thống.',
    `Họ tên: ${driver.fullName}`,
    `Email: ${driver.email}`,
    `Số điện thoại: ${driver.phone}`,
    `Loại xe: ${driver.vehicleType}`,
    `Giấy phép lái xe: ${driver.licenseNumber}`,
    `Duyệt tại: ${dashboardUrl}`,
  ].join('\n');

  await sendEmail({
    to: ADMIN_EMAILS,
    subject: 'Tài xế mới đang chờ phê duyệt',
    html,
    text,
  });
};

const notifyDriverApprovalUpdate = async (driver) => {
  if (!driver.email) return;

  if (driver.approvalStatus === 'approved') {
    const html = `
      <h2>Chúc mừng ${driver.fullName}!</h2>
      <p>Hồ sơ tài xế của bạn đã được <strong>phê duyệt</strong>.</p>
      <p>Bạn có thể đăng nhập ứng dụng tài xế và bắt đầu nhận đơn ngay.</p>
      ${driver.approvalNotes ? `<p><strong>Ghi chú:</strong> ${driver.approvalNotes}</p>` : ''}
    `;
    const text = [
      `Chúc mừng ${driver.fullName}! Hồ sơ của bạn đã được phê duyệt.`,
      driver.approvalNotes ? `Ghi chú: ${driver.approvalNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    await sendEmail({
      to: driver.email,
      subject: 'Hồ sơ tài xế đã được phê duyệt',
      html,
      text,
    });
  } else if (driver.approvalStatus === 'rejected') {
    const html = `
      <h2>Rất tiếc, hồ sơ của bạn chưa được phê duyệt</h2>
      <p>Vui lòng kiểm tra lại thông tin và gửi lại hồ sơ.</p>
      ${driver.approvalNotes ? `<p><strong>Lý do:</strong> ${driver.approvalNotes}</p>` : ''}
    `;
    const text = [
      'Hồ sơ của bạn chưa được phê duyệt.',
      driver.approvalNotes ? `Lý do: ${driver.approvalNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    await sendEmail({
      to: driver.email,
      subject: 'Hồ sơ tài xế chưa được phê duyệt',
      html,
      text,
    });
  }
};

export const registerDriver = async (req, res) => {
  try {
    const { fullName, email, phone, vehicleType, licenseNumber, address, documents } = req.body;

    if (!fullName || !email || !phone || !vehicleType || !licenseNumber) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin bắt buộc.' });
    }

    const existing = await Driver.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email đã được sử dụng cho một tài xế khác.' });
    }

    const driver = await Driver.create({
      fullName,
      email,
      phone,
      vehicleType,
      licenseNumber,
      address,
      documents: Array.isArray(documents) ? documents : [],
    });

    await notifyAdminsAboutNewDriver(driver).catch((err) => {
      console.error('Failed to dispatch driver registration email:', err.message);
    });

    if (email) {
      const html = `
        <h2>Xin chào ${fullName},</h2>
        <p>Hồ sơ đăng ký tài xế của bạn đã được tiếp nhận.</p>
        <p>Đội ngũ Super Admin sẽ duyệt và gửi kết quả qua email trong thời gian sớm nhất.</p>
        <p>Cảm ơn bạn đã đồng hành cùng chúng tôi!</p>
      `;
      const text = [
        `Xin chào ${fullName},`,
        'Hồ sơ đăng ký tài xế của bạn đã được tiếp nhận.',
        'Super Admin sẽ duyệt và phản hồi qua email trong thời gian sớm nhất.',
        'Cảm ơn bạn đã đồng hành cùng chúng tôi!',
      ].join('\n');

      await sendEmail({
        to: email,
        subject: 'Hồ sơ tài xế đã được tiếp nhận',
        html,
        text,
      }).catch((err) => console.error('Failed to send driver acknowledgement email:', err.message));
    }

    emitEvent({
      event: 'driver.registered',
      payload: {
        driverId: driver._id,
        approvalStatus: driver.approvalStatus,
      },
      rooms: ['role:superAdmin', `driver:${driver._id}`],
    });

    res.status(201).json({
      message: 'Đăng ký thành công. Hồ sơ của bạn đang chờ phê duyệt.',
      driver: formatDriver(driver),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error khi đăng ký tài xế.' });
  }
};

export const listDrivers = async (req, res) => {
  try {
    const { approvalStatus, status } = req.query;
    const filter = {};
    if (approvalStatus) {
      filter.approvalStatus = approvalStatus;
    }
    if (status) {
      filter.status = status;
    }

    const drivers = await Driver.find(filter).sort({ createdAt: -1 });
    res.json({ drivers: drivers.map(formatDriver) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error khi lấy danh sách tài xế.' });
  }
};

export const updateDriverApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalStatus, notes } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(approvalStatus)) {
      return res.status(400).json({ message: 'Trạng thái duyệt không hợp lệ.' });
    }

    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({ message: 'Không tìm thấy tài xế.' });
    }

    driver.approvalStatus = approvalStatus;
    driver.approvalNotes = notes || '';
    driver.lastReviewedBy = req.adminId;

    if (approvalStatus === 'approved') {
      driver.approvedAt = new Date();
      driver.rejectedAt = null;
      driver.status = 'offline';
      driver.onboardingEmailSentAt = new Date();
    } else if (approvalStatus === 'rejected') {
      driver.rejectedAt = new Date();
      driver.approvedAt = null;
      driver.status = 'offline';
    } else {
      driver.approvedAt = null;
      driver.rejectedAt = null;
      driver.status = 'offline';
    }

    await driver.save();

    emitEvent({
      event: 'driver.approval.updated',
      payload: {
        driverId: driver._id,
        approvalStatus: driver.approvalStatus,
        notes: driver.approvalNotes,
        updatedBy: req.adminId,
      },
      rooms: ['role:superAdmin', `driver:${driver._id}`],
    });

    await notifyDriverApprovalUpdate(driver).catch((err) => {
      console.error('Failed to send driver approval update email:', err.message);
    });

    res.json({ message: 'Cập nhật trạng thái tài xế thành công.', driver: formatDriver(driver) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error khi cập nhật trạng thái tài xế.' });
  }
};

export const updateDriverActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['online', 'offline', 'busy'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái hoạt động không hợp lệ.' });
    }

    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({ message: 'Không tìm thấy tài xế.' });
    }

    if (driver.approvalStatus !== 'approved') {
      return res.status(400).json({ message: 'Chỉ tài xế đã được phê duyệt mới có thể thay đổi trạng thái hoạt động.' });
    }

    driver.status = status;
    await driver.save();

    emitEvent({
      event: 'driver.activity.updated',
      payload: {
        driverId: driver._id,
        status: driver.status,
      },
      rooms: ['role:superAdmin', `driver:${driver._id}`],
    });

    res.json({ message: 'Cập nhật trạng thái hoạt động thành công.', driver: formatDriver(driver) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error khi cập nhật trạng thái hoạt động.' });
  }
};
