import z from "zod";

export const registerValidation = z.object({
  name: z
    .string({ message: "Tên người dùng là bắt buộc!" })
    .min(3, "Tên người dùng phải có ít nhất 3 ký tự!")
    .max(30, "Tên người dùng chỉ được nhập tối đa 30 ký tự!"),
  email: z
    .string({ message: "Email là bắt buộc!" })
    .email({ message: "Email phải đúng định dạng!" }),
  password: z
    .string({ message: "Mật khẩu là bắt buộc!" })
    .min(6, "Mật khẩu phải có ít nhất 6 ký tự")
    .max(20, "Mật khẩu chỉ được đặt tối đa 20 ký tự!"),
  phone: z
    .string({ message: "Số điện thoại là bắt buộc!" })
    .regex(
      /^0\d{6,13}$/,
      "Số điện thoại phải bắt đầu bằng 0 và có từ 7 đến 14 số!"
    ),
});

export const loginValidation = z.object({
  email: z
    .string({ message: "Email là bắt buộc!" })
    .email({ message: "Email phải đúng định dạng!" }),
  password: z
    .string({ message: "Mật khẩu là bắt buộc!" })
    .min(6, "Mật khẩu phải có ít nhất 6 ký tự")
    .max(20, "Mật khẩu chỉ được đặt tối đa 20 ký tự!"),
});
