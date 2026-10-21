import { Router } from "express";

import {
  getCustomers,
  getPendingCustomers,
  getCustomer,
  addCustomer,
  editCustomer,
  removeCustomer,
} from "../controller/customer.controller.js";

import {
  customerIdSchema,
  validateCustomer,
} from "../validators/customer.validator.js";

import { authenticate, allowRoles } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/validate.middleware.js";

const router = Router();

// Require a valid JWT for all customer endpoints
router.use(authenticate);

// GET /api/customers
router.get("/", allowRoles("admin", "billing"), getCustomers);

// GET /api/customers/pending
router.get(
  "/pending",
  allowRoles("admin", "billing"),
  getPendingCustomers
);

// GET /api/customers/:id
router.get(
  "/:id",
  allowRoles("admin", "billing"),
  validateRequest(customerIdSchema, "params"),
  getCustomer
);

// POST /api/customers
router.post("/", allowRoles("admin"), validateCustomer, addCustomer);

// PUT /api/customers/:id
router.put(
  "/:id",
  allowRoles("admin"),
  validateRequest(customerIdSchema, "params"),
  validateCustomer,
  editCustomer
);

// DELETE /api/customers/:id
router.delete(
  "/:id",
  allowRoles("admin"),
  validateRequest(customerIdSchema, "params"),
  removeCustomer
);

export default router;
