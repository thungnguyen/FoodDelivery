import express from "express";
import { listDrivers, updateDriverApproval, updateDriverActivity } from "../controllers/adminDriverController.js";
import adminAuth from "../middleware/adminAuth.js";

const router = express.Router();

router.get("/", adminAuth, listDrivers);
router.patch("/:id/status", adminAuth, updateDriverApproval);
router.patch("/:id/activity", adminAuth, updateDriverActivity);

export default router;
