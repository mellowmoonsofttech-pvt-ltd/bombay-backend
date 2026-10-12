
import { z } from "zod";

const optionalText = (max) =>
  z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.string().trim().max(max).optional()
  );

const nonNegativeNumber = (defaultValue = 0) =>
  z.preprocess(
    (value) => (value === "" || value == null ? defaultValue : value),
    z.coerce.number().finite().min(0)
  );

export const productIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid product ID"),
});

export const productQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
});

export const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category_id: z.string().regex(/^[a-f\d]{24}$/i, "Select a valid category"),
  unit: z.enum(["Meter", "Piece"]),
  purchase_rate: nonNegativeNumber(),
  wholesale_rate: nonNegativeNumber(),
  retail_rate: nonNegativeNumber(),
  min_stock: nonNegativeNumber(),

  sku: optionalText(80),
  brand: optionalText(100),
  color: optionalText(80),
  pattern: optionalText(100),
  hsn_code: optionalText(30),
  description: optionalText(2000),

  opening_stock: nonNegativeNumber(0).optional(),
  gst_percent: nonNegativeNumber(5).pipe(z.number().max(100)).optional(),
  is_active: z.boolean().optional().default(true),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(100),
});
