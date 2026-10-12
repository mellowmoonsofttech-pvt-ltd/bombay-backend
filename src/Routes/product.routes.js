
import { Router } from "express";

import {
  listProductsController,
  createProductController,
  updateProductController,
  deleteProductController,
  listCategoriesController,
  createCategoryController,
} from "../controller/product.controller.js";

import {
  authenticate,
  allowRoles,
} from "../middleware/auth.middleware.js";

import { validateRequest } from "../middleware/validate.middleware.js";

import {
  productSchema,
  productIdSchema,
  productQuerySchema,
  categorySchema,
} from "../validators/product.validator.js";

const router = Router();

const loggedInRoles = [
  "admin",
  "manager",
  "staff",
  "billing",
  "cashier",
];

const managementRoles = ["admin", "manager"];

// ===============================
// PRODUCT ROUTES
// ===============================

// GET /api/products
router.get(
  "/products",
  authenticate,
  allowRoles(...loggedInRoles),
  validateRequest(productQuerySchema, "query"),
  listProductsController
);

// POST /api/products
router.post(
  "/products",
  authenticate,
  allowRoles(...managementRoles),
  validateRequest(productSchema),
  createProductController
);

// PUT /api/products/:id
router.put(
  "/products/:id",
  authenticate,
  allowRoles(...managementRoles),
  validateRequest(productIdSchema, "params"),
  validateRequest(productSchema),
  updateProductController
);

// DELETE /api/products/:id
router.delete(
  "/products/:id",
  authenticate,
  allowRoles(...managementRoles),
  validateRequest(productIdSchema, "params"),
  deleteProductController
);

// ===============================
// CATEGORY ROUTES
// ===============================

// GET /api/categories
router.get(
  "/categories",
  authenticate,
  allowRoles(...loggedInRoles),
  listCategoriesController
);

// POST /api/categories
router.post(
  "/categories",
  authenticate,
  allowRoles(...managementRoles),
  validateRequest(categorySchema),
  createCategoryController
);

export default router;
