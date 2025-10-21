import mongoose from "mongoose";

const {
  Schema,
  Types: { ObjectId },
} = mongoose;

// 🔹 Enum cho role và status
const ROLE_ENUM = ["admin", "user"];
const USER_STATUS_ENUM = ["active", "inactive", "banned"];

const UserSchema = new Schema(
  {
    username: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, unique: true, sparse: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ROLE_ENUM, default: "user" },
    status: { type: String, enum: USER_STATUS_ENUM, default: "active" },
    avatar: { type: String, default: "" },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

// 🔍 Index tối ưu tìm kiếm
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });

export default mongoose.model("User", UserSchema);
