import { StatusCodes } from "http-status-codes";
import createError from "../../utils/error.js";
import userModels from "../users/user.models.js";
import { generateToken, hashPassword, verifyToken } from "./auth.utils.js";
import bcrypt from "bcryptjs";

export const registerService = async (payload) => {
  const existsUser = await userModels.findOne({ email: payload.email });
  if (existsUser) {
    throw createError(
      StatusCodes.BAD_REQUEST,
      "Tài khoản này đã được đăng ký!"
    );
  }
  const password = await hashPassword(payload.password);
  const user = await userModels.create({ ...payload, password });
  return user;
};

export const loginService = async (payload) => {
  const findUser = await userModels.findOne({ email: payload.email });
  if (!findUser) {
    throw createError(
      StatusCodes.BAD_REQUEST,
      "Thông tin đăng nhập không chính xác!"
    );
  }
  const matchedPassword = await bcrypt.compare(
    payload.password,
    findUser.password
  );
  if (!matchedPassword) {
    throw createError(
      StatusCodes.BAD_REQUEST,
      "Thông tin đăng nhập không chính xác!"
    );
  }
  const jwtData = {
    _id: findUser._id,
    role: findUser.role,
  };
  const accessToken = generateToken(jwtData);
  return { user: findUser, accessToken };
};

export const forgotPasswordService = async (email) => {
  const user = await userModels.findOne({ email });
  if (!user) {
    throw createError(
      StatusCodes.NOT_FOUND,
      "Email không tồn tại trong hệ thống!"
    );
  }

  const resetToken = generateToken({ _id: user._id }, "15m");

  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();

  return { resetToken, email: user.email, user };
};

export const resetPasswordService = async (resetToken, newPassword) => {
  try {
    const decoded = verifyToken(resetToken);

    const user = await userModels.findOne({
      _id: decoded._id,
      resetPasswordToken: resetToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw createError(
        StatusCodes.BAD_REQUEST,
        "Token reset không hợp lệ hoặc đã hết hạn!"
      );
    }

    const hashedPassword = await hashPassword(newPassword);

    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return { message: "Mật khẩu đã được cập nhật thành công!" };
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      throw createError(StatusCodes.BAD_REQUEST, "Token reset không hợp lệ!");
    }
    throw error;
  }
};

export const verifyResetTokenService = async (resetToken) => {
  try {
    const decoded = verifyToken(resetToken);

    const user = await userModels.findOne({
      _id: decoded._id,
      resetPasswordToken: resetToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw createError(
        StatusCodes.BAD_REQUEST,
        "Token reset không hợp lệ hoặc đã hết hạn!"
      );
    }

    return {
      valid: true,
      message: "Token hợp lệ",
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    };
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      throw createError(StatusCodes.UNAUTHORIZED, "Token reset không hợp lệ!");
    }
    throw error;
  }
};


