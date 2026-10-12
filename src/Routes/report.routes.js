 import { Router } from "express";
import {
  authenticate,
  allowRoles,
} from "../middleware/auth.middleware.js";
import {
  getReportDataController,
} from "../controller/report.controller.js";

const router = Router();

router.use(authenticate, allowRoles("admin"));

router.get("/", getReportDataController);

export default router;
