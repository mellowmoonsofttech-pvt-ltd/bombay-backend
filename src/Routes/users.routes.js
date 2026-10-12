
import { Router } from "express";
import {
  getProfilesController,
  createStaffUserController,
  updateStaffUserController,
} from "../controller/users.controller.js";
import {
  authenticate,
  allowRoles,
} from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate, allowRoles("admin"));

router.get("/profiles", getProfilesController);
router.post("/", createStaffUserController);
router.patch("/:id", updateStaffUserController);

export default router;
