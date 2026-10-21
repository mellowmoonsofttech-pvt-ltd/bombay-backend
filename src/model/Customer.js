import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    mobile: {
      type: String,
      trim: true,
      default: "",
      maxlength: [15, "Mobile cannot exceed 15 characters"],
    },
    normalized_mobile: {
      type: String,
      select: false,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

customerSchema.index({ name: 1 });
customerSchema.index({ mobile: 1 });
customerSchema.index(
  { normalized_mobile: 1 },
  {
    unique: true,
    partialFilterExpression: {
      normalized_mobile: { $type: "string" },
    },
  }
);

export default mongoose.model("Customer", customerSchema);
