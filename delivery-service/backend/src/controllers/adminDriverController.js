import Driver from "../models/Driver.js";

const sanitizeStatus = (status) => {
  const allowed = ["offline", "online", "busy", "available", "on-delivery"];
  return allowed.includes(status) ? status : "offline";
};

const formatDriver = (driver) => ({
  id: driver._id,
  name: driver.name,
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
  totalTrips: driver.totalTrips || 0,
  acceptanceRate: driver.acceptanceRate ?? 0,
  rating: driver.rating ?? null,
  currentLocation: driver.currentLocation || "",
  createdAt: driver.createdAt,
  updatedAt: driver.updatedAt,
});

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
    console.error("listDrivers error:", error);
    res.status(500).json({ message: "Server error khi lấy danh sách tài xế." });
  }
};

export const updateDriverApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalStatus, notes } = req.body;

    if (!["pending", "approved", "rejected"].includes(approvalStatus)) {
      return res.status(400).json({ message: "Trạng thái duyệt không hợp lệ." });
    }

    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({ message: "Không tìm thấy tài xế." });
    }

    driver.approvalStatus = approvalStatus;
    driver.approvalNotes = notes || "";
    driver.lastReviewedBy = req.adminId;

    if (approvalStatus === "approved") {
      driver.approvedAt = new Date();
      driver.rejectedAt = null;
      driver.status = sanitizeStatus(driver.status || "offline");
      driver.onboardingEmailSentAt = driver.onboardingEmailSentAt || new Date();
    } else if (approvalStatus === "rejected") {
      driver.rejectedAt = new Date();
      driver.approvedAt = null;
      driver.status = "offline";
    } else {
      driver.approvedAt = null;
      driver.rejectedAt = null;
      driver.status = "offline";
    }

    await driver.save();

    res.json({
      message: "Cập nhật trạng thái tài xế thành công.",
      driver: formatDriver(driver),
    });
  } catch (error) {
    console.error("updateDriverApproval error:", error);
    res.status(500).json({ message: "Server error khi cập nhật trạng thái tài xế." });
  }
};

export const updateDriverActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["offline", "online", "busy"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Trạng thái hoạt động không hợp lệ." });
    }

    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({ message: "Không tìm thấy tài xế." });
    }

    if (driver.approvalStatus !== "approved") {
      return res
        .status(400)
        .json({ message: "Chỉ tài xế đã được phê duyệt mới có thể thay đổi trạng thái hoạt động." });
    }

    driver.status = status;
    await driver.save();

    res.json({
      message: "Cập nhật trạng thái hoạt động thành công.",
      driver: formatDriver(driver),
    });
  } catch (error) {
    console.error("updateDriverActivity error:", error);
    res.status(500).json({ message: "Server error khi cập nhật trạng thái hoạt động của tài xế." });
  }
};
