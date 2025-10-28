import mongoose from "mongoose";
import {
    DEFAULT_COMMISSION_RATE,
    DEFAULT_MAINTENANCE_FEE,
    DEFAULT_MAINTENANCE_INTERVAL_DAYS
} from "../config/financeConfig.js";

const restaurantFinanceProfileSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: String,
            required: true,
            unique: true
        },
        commissionRate: {
            type: Number,
            default: DEFAULT_COMMISSION_RATE,
            min: 0
        },
        maintenanceFee: {
            type: Number,
            default: DEFAULT_MAINTENANCE_FEE,
            min: 0
        },
        maintenanceIntervalDays: {
            type: Number,
            default: DEFAULT_MAINTENANCE_INTERVAL_DAYS,
            min: 1
        },
        lastMaintenanceChargedAt: {
            type: Date
        },
        nextMaintenanceChargeAt: {
            type: Date
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed
        }
    },
    { timestamps: true }
);

const RestaurantFinanceProfile = mongoose.model(
    "RestaurantFinanceProfile",
    restaurantFinanceProfileSchema
);

export default RestaurantFinanceProfile;
