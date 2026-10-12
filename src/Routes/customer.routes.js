import { Router } from "express";

import {
  getCustomers,
  getCustomer,
  addCustomer,
  editCustomer,
  removeCustomer,
} from "../controller/customer.controller.js";

import { validateCustomer } from "../validators/customer.validator.js";

import { authenticate, allowRoles } from "../middleware/auth.middleware.js";

const router = Router();

// Require a valid JWT for all customer endpoints
router.use(authenticate);

// Customer management is restricted to admins
router.use(allowRoles("admin"));

// GET /api/customers
router.get("/", getCustomers);

// GET /api/customers/:id
router.get("/:id", getCustomer);

// POST /api/customers
router.post("/", validateCustomer, addCustomer);

// PUT /api/customers/:id
router.put("/:id", validateCustomer, editCustomer);

// DELETE /api/customers/:id
router.delete("/:id", removeCustomer);

export default router;
