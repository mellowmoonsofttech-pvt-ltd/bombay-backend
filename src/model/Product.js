
import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    sku: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 80,
      default: undefined,
    },

    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    brand: { type: String, trim: true, maxlength: 100, default: "" },
    color: { type: String, trim: true, maxlength: 80, default: "" },
    pattern: { type: String, trim: true, maxlength: 100, default: "" },
    hsn_code: { type: String, trim: true, maxlength: 30, default: "" },
    description: { type: String, trim: true, maxlength: 2000, default: "" },

    unit: {
      type: String,
      enum: ["Meter", "Piece"],
      required: true,
      default: "Meter",
    },

    purchase_rate: { type: Number, min: 0, required: true, default: 0 },
    wholesale_rate: { type: Number, min: 0, required: true, default: 0 },
    retail_rate: { type: Number, min: 0, required: true, default: 0 },
    gst_percent: { type: Number, min: 0, max: 100, default: 5 },

    current_stock: { type: Number, min: 0, default: 0 },
    current_piece_stock: { type: Number, min: 0, default: 0 },
    min_stock: { type: Number, min: 0, required: true, default: 0 },

    is_active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, strict: "throw" }
);

productSchema.index({ name: 1 });

// Blank/missing SKU values must not conflict with one another.
productSchema.index(
  { sku: 1 },
  {
    unique: true,
    partialFilterExpression: { sku: { $type: "string" } },
  }
);

productSchema.index({ category_id: 1 });
productSchema.index({ is_active: 1, name: 1 });

const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);

export default Product;
