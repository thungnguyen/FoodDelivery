import express from "express";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import {
    assignDroneToOrder,
    droneArrivedCustomer,
    droneArrivedRestaurant,
    dronePickupOrder,
    droneReturnToHub,
    forceReturnDrone,
    cancelDroneDelivery
} from "../controllers/droneFlowController.js";

const router = express.Router();

router.post("/admin/drone/assign", protect, authorizeRoles("admin", "superAdmin"), assignDroneToOrder);
router.post("/drone/arrived-restaurant", protect, authorizeRoles("admin", "superAdmin"), droneArrivedRestaurant);
router.post("/order/drone-pickup", protect, authorizeRoles("admin", "superAdmin"), dronePickupOrder);
router.post("/drone/arrived-customer", protect, authorizeRoles("admin", "superAdmin"), droneArrivedCustomer);
router.post("/drone/return", protect, authorizeRoles("admin", "superAdmin"), droneReturnToHub);
router.post("/admin/drone-force-return", protect, authorizeRoles("admin", "superAdmin"), forceReturnDrone);
router.post("/admin/drone-cancel", protect, authorizeRoles("admin", "superAdmin"), cancelDroneDelivery);

export default router;
