
import { Router } from "express";

import {
  listPurchasesController,
  getPurchaseController,
  createPurchaseController,
  updatePurchaseController,
  deletePurchaseController,
  recordPaymentController,
} from "../controller/purchase.controller.js";

import {
  validatePurchase,
  validatePayment,
  validateObjectId,
} from "../validators/purchase.validator.js";

import {
  authenticate,
  allowRoles,
} from "../middleware/auth.middleware.js";

const router = Router();

// Authentication and role authorization
router.use(authenticate);
router.use(allowRoles("admin", "manager"));

// GET /api/purchases
router.get("/", listPurchasesController);

// GET /api/purchases/:id
router.get("/:id", validateObjectId, getPurchaseController);

// POST /api/purchases
router.post("/", validatePurchase, createPurchaseController);

// PUT /api/purchases/:id
router.put(
  "/:id",
  validateObjectId,
  validatePurchase,
  updatePurchaseController
);

// POST /api/purchases/:id/payments
router.post(
  "/:id/payments",
  validateObjectId,
  validatePayment,
  recordPaymentController
);

// DELETE /api/purchases/:id
router.delete("/:id", validateObjectId, deletePurchaseController);

export default router;
