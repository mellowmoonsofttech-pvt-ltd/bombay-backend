
  import mongoose from "mongoose";

  const invoiceItemSchema = new mongoose.Schema(
    {
      product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      product_name: {
        type: String,
        required: true,
        trim: true,
      },
      category_name: {
        type: String,
        default: "",
      },
      sku: {
        type: String,
        default: "",
      },
      unit: {
        type: String,
        enum: ["Meter", "Piece"],
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 0.001,
      },
      piece_quantity: {
        type: Number,
        default: 0,
        min: 0,
      },
      rate: {
        type: Number,
        required: true,
        min: 0,
      },
      purchase_rate: {
        type: Number,
        min: 0,
      },
      original_rate: {
        type: Number,
        default: 0,
        min: 0,
      },
      amount: {
        type: Number,
        required: true,
        min: 0,
      },
      discount_amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      taxable_amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      gst_percent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      gst_amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      price_overridden: {
        type: Boolean,
        default: false,
      },
    },
    {
      _id: true,
      strict: "throw",
    }
  );

  const invoiceSchema = new mongoose.Schema(
    {
      invoice_number: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        trim: true,
      },
      customer_name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 150,
      },
      customer_mobile: {
        type: String,
        required: true,
        trim: true,
        maxlength: 16,
      },
      customer_id: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      price_type: {
        type: String,
        enum: ["retail", "wholesale"],
        required: true,
      },
      payment_method: {
        type: String,
        required: true,
        trim: true,
      },
      discount_type: {
        type: String,
        enum: ["none", "fixed", "amount", "percent"],
        default: "none",
      },
      discount_value: {
        type: Number,
        min: 0,
        default: 0,
      },
      subtotal: {
        type: Number,
        required: true,
        min: 0,
      },
      discount_amount: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
      apply_gst: {
        type: Boolean,
        default: false,
      },
      gst_amount: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
      total: {
        type: Number,
        required: true,
        min: 0,
      },
      grand_total: {
        type: Number,
        required: true,
        min: 0,
      },
      items: {
        type: [invoiceItemSchema],
        required: true,
        validate: {
          validator: (items) =>
            Array.isArray(items) &&
            items.length >= 1 &&
            items.length <= 200,
          message: "Invoice must contain between 1 and 200 items",
        },
      },
      created_by: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      status: {
        type: String,
        enum: ["completed", "cancelled"],
        default: "completed",
      },
      cancel_reason: {
        type: String,
        default: null,
        maxlength: 500,
      },
    },
    {
      timestamps: true,
      strict: "throw",
    }
  );

  invoiceSchema.index({ createdAt: -1 });
  invoiceSchema.index({ customer_mobile: 1, createdAt: -1 });

  const Invoice =
    mongoose.models.Invoice ||
    mongoose.model("Invoice", invoiceSchema);

  export default Invoice;
