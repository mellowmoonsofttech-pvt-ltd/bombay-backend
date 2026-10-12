
import { z } from "zod";

export const invoiceIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid invoice ID"),
});

export const productQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
});

const invoiceItemSchema = z.object({
  product_id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid product ID"),
  quantity: z.number().finite().positive().max(100000),
  rate: z.number().finite().min(0).max(100000000),
  piece_quantity: z.number().finite().min(0).optional().default(0),
});

export const createInvoiceSchema = z.object({
  customer_id: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid customer ID")
    .nullable()
    .optional()
    .default(null),

  customer_name: z
    .string()
    .trim()
    .min(1, "Customer name is required")
    .max(150),

  customer_mobile: z
    .string()
    .trim()
    .min(1, "Customer mobile is required")
    .max(16),

  price_type: z.enum(["retail", "wholesale"]).optional(),

  payment_method: z.enum([
    "Cash",
    "UPI",
    "Card",
    "Bank Transfer",
  ]),

  discount_type: z
    .enum(["none", "fixed", "amount", "percent"])
    .optional()
    .default("none"),

  discount_value: z
    .number()
    .finite()
    .min(0)
    .max(100000000)
    .optional()
    .default(0),

  apply_gst: z.boolean().optional().default(false),

  items: z.array(invoiceItemSchema).min(1).max(200),
});
