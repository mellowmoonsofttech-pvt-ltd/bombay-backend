import { z } from "zod";

const purchaseItemSchema = z.object({
  productName: z.string().trim().min(1).max(150),
  quantity: z.coerce.number().finite().min(0.01).max(10000000),
  unit: z.string().trim().min(1).max(30),
  unitPrice: z.coerce.number().finite().min(0).max(100000000),
  gstPercent: z.coerce.number().finite().min(0).max(100).default(0),
});

const purchaseBodySchema = z.object({
  invoiceNumber: z.string().trim().max(100).optional().default(""),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Purchase date must be YYYY-MM-DD"),
  supplierName: z.string().trim().min(1).max(150),
  supplierGstin: z.string().trim().max(15).optional().default(""),
  items: z.array(purchaseItemSchema).min(1).max(200),
  paymentMode: z.enum(["Cash", "Credit"]),
  paidAmount: z.coerce.number().finite().min(0).max(100000000),
  notes: z.string().trim().max(1000).optional().default(""),
}).strict();

export function validatePurchase(req, res, next) {
  const result = purchaseBodySchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid purchase data",
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  req.validatedBody = result.data;
  next();
}

export function validatePayment(req, res, next) {
  const schema = z.object({
    amount: z.coerce.number().finite().gt(0).max(100000000),
  }).strict();

  const result = schema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: "A valid payment amount is required",
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  req.validatedBody = result.data;
  next();
}

export function validateObjectId(req, res, next) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id || "")) {
    return res.status(400).json({
      success: false,
      message: "Invalid purchase ID",
    });
  }

  next();
}
