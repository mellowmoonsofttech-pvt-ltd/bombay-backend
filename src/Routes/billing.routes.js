
import { Router } from "express";

import {
  settingsController,
  productsController,
  createInvoiceController,
  getInvoiceController,
  getInvoicesController,
  editInvoiceController,
  cancelInvoiceController,
  deleteInvoiceController,
} from "../controller/billing.controller.js";

import {
  authenticate,
  allowRoles,
} from "../middleware/auth.middleware.js";

import { validateRequest } from "../middleware/validate.middleware.js";

import { adminLoginController } from "../controller/auth.controller.js";

import {
  createInvoiceSchema,
  invoiceIdSchema,
  productQuerySchema,
} from "../validators/billing.validator.js";

const router = Router();

const billingRoles = allowRoles(
  "admin",
  "manager",
  "staff",
  "billing",
  "cashier"
);

const managerRoles = allowRoles("admin", "manager");

router.get(
  "/settings",
  authenticate,
  billingRoles,
  settingsController
);

router.get(
  "/products",
  authenticate,
  billingRoles,
  validateRequest(productQuerySchema, "query"),
  productsController
);

// Keep the list route before /invoices/:id.
router.get(
  "/invoices",
  authenticate,
  billingRoles,
  getInvoicesController
);

router.post(
  "/invoices",
  authenticate,
  billingRoles,
  validateRequest(createInvoiceSchema),
  createInvoiceController
);

router.put(
  "/invoices/:id",
  authenticate,
  billingRoles,
  validateRequest(invoiceIdSchema, "params"),
  validateRequest(createInvoiceSchema),
  editInvoiceController
);

router.patch(
  "/invoices/:id/cancel",
  authenticate,
  managerRoles,
  validateRequest(invoiceIdSchema, "params"),
  cancelInvoiceController
);

router.delete(
  "/invoices/:id",
  authenticate,
  managerRoles,
  validateRequest(invoiceIdSchema, "params"),
  deleteInvoiceController
);

router.get(
  "/invoices/:id",
  authenticate,
  billingRoles,
  validateRequest(invoiceIdSchema, "params"),
  getInvoiceController
);

router.post(
  "/auth/admin-login",
  adminLoginController
);

export default router;
