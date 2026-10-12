import mongoose from "mongoose";

const purchaseItemSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    gstPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    taxableAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    gstAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: false }
);

const purchasePaymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    mode: {
      type: String,
      enum: ["Cash", "Credit"],
      required: true,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    purchaseDate: {
      type: String,
      required: true,
    },
    supplierName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    supplierGstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      maxlength: 15,
    },
    items: {
      type: [purchaseItemSchema],
      required: true,
      validate: {
        validator: (items) =>
          Array.isArray(items) &&
          items.length >= 1 &&
          items.length <= 200,
        message: "Purchase must contain 1 to 200 items",
      },
    },
    taxableAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    gstAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMode: {
      type: String,
      enum: ["Cash", "Credit"],
      required: true,
    },
    paidAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    pendingAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Partially Paid", "Pending"],
      required: true,
    },
    payments: {
      type: [purchasePaymentSchema],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true, strict: "throw" }
);

purchaseSchema.index({ createdAt: -1 });
purchaseSchema.index({ purchaseDate: -1 });
purchaseSchema.index({ supplierName: 1 });
purchaseSchema.index({ invoiceNumber: 1 });

export default mongoose.model("Purchase", purchaseSchema);
