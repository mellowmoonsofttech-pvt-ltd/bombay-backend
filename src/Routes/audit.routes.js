import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { getAuditLogsController } from "../controller/audit.controller.js";

const router = Router();

// GET /api/audit
router.get("/", authenticate, getAuditLogsController);

export default router;