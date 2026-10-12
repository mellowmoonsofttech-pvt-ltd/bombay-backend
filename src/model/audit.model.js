import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    details: {
      type: String,
      default: "",
      maxlength: 2000,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  }
);

export default mongoose.models.AuditLog ||
  mongoose.model("AuditLog", auditLogSchema);