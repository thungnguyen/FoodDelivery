const jwt = require("jsonwebtoken");

const serviceKey = process.env.SERVICE_INTERNAL_KEY || "super-admin-internal-key";

module.exports = (req, res, next) => {
  try {
    const providedKey = req.headers["x-service-key"];
    if (serviceKey && providedKey && providedKey === serviceKey) {
      req.adminId = "internal-service";
      return next();
    }

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing authentication token." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "superAdmin") {
      return res.status(403).json({ message: "Bạn không có quyền truy cập tài nguyên này." });
    }

    req.adminId = decoded.id;
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn." });
  }
};
