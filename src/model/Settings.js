
import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "billing",
      unique: true,
      immutable: true,
    },
    business_name: { type: String, default: "Bombay Suiting & Shirting", trim: true },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    gstin: { type: String, default: "" },

    invoice_prefix: { type: String, default: "BSS-" },
    next_invoice_no: { type: Number, default: 1, min: 1 },
    invoice_footer: { type: String, default: "Thank you for your business!" },

    default_price_type: {
      type: String,
      enum: ["retail", "wholesale"],
      default: "retail",
    },
    allow_discount: { type: Boolean, default: true },
    billing_can_discount: { type: Boolean, default: true },
    allow_price_override: { type: Boolean, default: false },
    billing_can_override: { type: Boolean, default: false },
    allow_negative_stock: { type: Boolean, default: false },
    low_stock_alerts: { type: Boolean, default: true },

    max_discount_percent: { type: Number, min: 0, max: 100, default: 10 },
    max_discount_amount: { type: Number, min: 0, default: 0 },

    payment_methods: {
      type: [String],
      default: ["Cash", "UPI", "Card", "Credit", "Other"],
    },
  },
  { timestamps: true, strict: "throw" }
);

const Settings =
  mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

export default Settings;
