import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
const PORT = process.env.PORT || 8080;

dotenv.config();
const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "frontend/build");

app.use(cors());
app.use(express.json());

// Hook up service routers here when ready
const connectAuthDB = require("./backend/auth-service/config/db");
const authRoutes = require("./backend/auth-service/routes/authRoutes");
let Restaurant;

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(express.static(distPath));

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const start = async () => {
  try {
    await connectAuthDB();
    app.use("/api/auth", authRoutes);

    // Connect restaurant DB separately to avoid clobbering auth connection
    const connectRestaurantDB = async () => {
      const uri = process.env.RESTAURANT_MONGO_URI || process.env.MONGO_URI;
      if (!uri) {
        throw new Error("Missing RESTAURANT_MONGO_URI (or fallback MONGO_URI)");
      }
      const options = { dbName: process.env.RESTAURANT_DB_NAME || "restaurants_db" };
      const conn = await mongoose.createConnection(uri, options).asPromise();

      const restaurantSchema = new mongoose.Schema(
        {
          name: { type: String, required: true },
          taxCode: { type: String, required: true, unique: true, trim: true },
          ownerName: { type: String, required: true },
          location: { type: String, required: true },
          locationCoords: {
            lat: { type: Number },
            lng: { type: Number },
          },
          contactNumber: { type: String, required: true },
          profilePicture: { type: String, default: "" },
          approvalStatus: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
          },
          approvalNotes: { type: String },
          approvedAt: { type: Date },
          rejectedAt: { type: Date },
          lastReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin" },
          onboardingEmailSentAt: { type: Date },
          onboardingOtpHash: { type: String },
          onboardingOtpExpiresAt: { type: Date },
          onboardingOtpVerifiedAt: { type: Date },
          onboardingPasswordMustChange: { type: Boolean, default: true },
          admin: {
            email: {
              type: String,
              required: true,
              unique: true,
              lowercase: true,
              trim: true,
            },
            password: { type: String, default: "" },
          },
          availability: { type: Boolean, default: false },
          bankAccountNumber: { type: String, trim: true, default: "" },
          bankAccountName: { type: String, trim: true, default: "" },
          bankName: { type: String, trim: true, default: "" },
        },
        { timestamps: true }
      );

      restaurantSchema.pre("save", async function (next) {
        if (this.isModified("admin.password")) {
          const rawPassword = this.admin.password;
          if (typeof rawPassword === "string" && rawPassword.trim().length) {
            const salt = await bcrypt.genSalt(10);
            this.admin.password = await bcrypt.hash(rawPassword, salt);
          } else {
            this.admin.password = "";
          }
        }
        next();
      });

      restaurantSchema.methods.compareAdminPassword = async function (password) {
        if (!this.admin?.password || !this.admin.password.trim().length) {
          return false;
        }
        return bcrypt.compare(password, this.admin.password);
      };

      Restaurant = conn.model("Restaurant", restaurantSchema);
    };

    await connectRestaurantDB();

    app.post("/api/restaurants/login", async (req, res) => {
      try {
        const { email, password } = req.body || {};
        if (!email || !password) {
          return res.status(400).json({ message: "Email và mật khẩu là bắt buộc." });
        }

        const restaurant = await Restaurant.findOne({ "admin.email": email });
        if (!restaurant) {
          return res.status(400).json({ message: "Invalid credentials" });
        }

        const isMatch = await restaurant.compareAdminPassword(password);
        if (!isMatch) {
          return res.status(400).json({ message: "Invalid credentials" });
        }

        if (restaurant.onboardingPasswordMustChange) {
          return res.status(403).json({
            message: "Tài khoản cần được kích hoạt bằng OTP và đổi mật khẩu trước khi đăng nhập.",
            requiresPasswordChange: true,
          });
        }

        const token = jwt.sign(
          {
            id: restaurant._id,
            restaurantId: restaurant._id,
            role: "restaurant",
            email: restaurant.admin.email,
          },
          process.env.JWT_SECRET,
          { expiresIn: "30d" }
        );

        res.status(200).json({ token });
      } catch (err) {
        console.error("Restaurant login error:", err);
        res.status(500).json({ message: "Server Error" });
      }
    });

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

start();
