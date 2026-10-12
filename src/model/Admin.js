
import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["admin", "billing"],
      default: "billing",
      required: true,
    },
    is_active: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Admin", adminSchema);
