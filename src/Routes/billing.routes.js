
import { Router } from "express";

import {
  settingsController,
  updateSettingsController,
  productsController,
  createInvoiceController,
  getInvoiceController,
  getInvoicesController,
  editInvoiceController,
  cancelInvoiceController,
  deleteInvoiceController,
  getInvoicePaidAmountsController,
  getInvoicePaymentsController,
  recordInvoicePaymentController,
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
  invoicePaymentSchema,
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

// Read billing settings
router.get(
  "/settings",
  authenticate,
  billingRoles,
  settingsController
);

// Update billing settings — admin and manager only
router.put(
  "/settings",
  authenticate,
  managerRoles,
  updateSettingsController
);

// Products
router.get(
  "/products",
  authenticate,
  billingRoles,
  validateRequest(productQuerySchema, "query"),
  productsController
);

// Keep the invoice list route before /invoices/:id
router.get(
  "/invoices",
  authenticate,
  billingRoles,
  getInvoicesController
);

// Invoice payment totals and histories are visible to billing roles.
router.get(
  "/invoice-payments",
  authenticate,
  billingRoles,
  getInvoicePaidAmountsController
);

router.get(
  "/invoices/:id/payments",
  authenticate,
  billingRoles,
  validateRequest(invoiceIdSchema, "params"),
  getInvoicePaymentsController
);

// Only admins can record customer payments.
router.post(
  "/invoices/:id/payments",
  authenticate,
  allowRoles("admin"),
  validateRequest(invoiceIdSchema, "params"),
  validateRequest(invoicePaymentSchema),
  recordInvoicePaymentController
);

// Create invoice
router.post(
  "/invoices",
  authenticate,
  billingRoles,
  validateRequest(createInvoiceSchema),
  createInvoiceController
);

// Edit invoice
router.put(
  "/invoices/:id",
  authenticate,
  billingRoles,
  validateRequest(invoiceIdSchema, "params"),
  validateRequest(createInvoiceSchema),
  editInvoiceController
);

// Cancel invoice
router.patch(
  "/invoices/:id/cancel",
  authenticate,
  managerRoles,
  validateRequest(invoiceIdSchema, "params"),
  cancelInvoiceController
);

// Delete invoice
router.delete(
  "/invoices/:id",
  authenticate,
  managerRoles,
  validateRequest(invoiceIdSchema, "params"),
  deleteInvoiceController
);

// Get invoice by ID
router.get(
  "/invoices/:id",
  authenticate,
  billingRoles,
  validateRequest(invoiceIdSchema, "params"),
  getInvoiceController
);

// Admin login
router.post(
  "/auth/admin-login",
  adminLoginController
);

export default router;
