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

// NOTE: Auth removed for demo use; re-enable protect/authorizeRoles for production.
router.post("/admin/drone/assign", assignDroneToOrder);
router.post("/drone/arrived-restaurant", droneArrivedRestaurant);
router.post("/order/drone-pickup", dronePickupOrder);
router.post("/drone/arrived-customer", droneArrivedCustomer);
router.post("/drone/return", droneReturnToHub);
router.post("/admin/drone-force-return", forceReturnDrone);
router.post("/admin/drone-cancel", cancelDroneDelivery);

export default router;
