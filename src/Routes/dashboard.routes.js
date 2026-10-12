
import { Router } from "express";
import { dashboardController } from "../controller/dashboard.controller.js";
import {
  authenticate,
  allowRoles,
} from "../middleware/auth.middleware.js";

const router = Router();

router.get(
  "/dashboard",
  authenticate,
  allowRoles("admin", "manager", "staff", "billing", "cashier"),
  dashboardController
);

export default router;
