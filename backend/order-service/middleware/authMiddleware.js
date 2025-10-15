import jwt from "jsonwebtoken";

const serviceKey = process.env.SERVICE_INTERNAL_KEY || "super-admin-internal-key";

// Middleware to protect routes by verifying JWT or internal service key
const protect = (req, res, next) => {
    const providedKey = req.header("x-service-key");
    if (serviceKey && providedKey && providedKey === serviceKey) {
        req.user = {
            id: "internal-service",
            role: "admin",
            service: true,
        };
        return next();
    }

    const token = req.header("Authorization")?.split(" ")[1]; // Extract token after "Bearer"

    if (!token) {
        return res.status(401).json({ message: "No token, authorization denied" });
    }

    try {
        // Verify the token using the secret key
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded.role) {
            return res.status(401).json({ message: "Invalid token: Role not found" });
        }

        req.user = decoded; // Attach decoded user data to the request
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        res.status(401).json({ message: "Invalid token" });
    }
};

// Middleware to check for specific roles
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ message: "Access denied: Role not found" });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Access denied: Unauthorized role" });
        }

        next(); // Proceed if role matches
    };
};

export { protect, authorizeRoles };

