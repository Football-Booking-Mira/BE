import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tên không được để trống"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email không được để trống"],
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email không hợp lệ"],
    },

    phone: {
      type: String,
      required: [true, "Số điện thoại không được để trống"],
      match: [/^0\d{9}$/, "Số điện thoại phải bắt đầu bằng 0 và đủ 10 số"],
    },

    message: {
      type: String,
      required: [true, "Nội dung liên hệ không được để trống"],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Contact", contactSchema);
