import { StatusCodes } from "http-status-codes";
import createResponse from "../../utils/responses.js";
import handleAsync from "../../utils/handleAsync.js";
import {
  loginService,
  registerService,
  forgotPasswordService,
  resetPasswordService,
  verifyResetTokenService,
} from "./auth.service.js";
import { FONT_END_URL } from "../../common/config/environment.js";
import sendMail from "../../utils/sendEmail.js";
import { htmlForgot, htmlReset } from "../../utils/renderHMTLTemp.js";

export const register = handleAsync(async (req, res, next) => {
  const response = await registerService(req.body);
  return res
    .status(StatusCodes.OK)
    .json(
      createResponse(StatusCodes.CREATED, "Đăng ký thành công", response)
    );
});

export const login = handleAsync(async (req, res, next) => {
  const response = await loginService(req.body);
  return res
    .status(StatusCodes.OK)
    .json(createResponse(StatusCodes.OK, "Đăng nhập thành công", response));
});

export const forgotPassword = handleAsync(async (req, res, next) => {
  const { email } = req.body;
  const result = await forgotPasswordService(email);
  console.log(result);
  const link = `${FONT_END_URL}/verify?token=${result.resetToken}`;
  const ok = await sendMail({
    to: email,
    subject: "Xác nhận đặt lại mật khẩu",
    html: htmlForgot(email, result.user.name, link),
  });
  console.log(ok);
  return res
    .status(StatusCodes.OK)
    .json(
      createResponse(
        "Ok",
        StatusCodes.OK,
        "Đã gửi link reset mật khẩu đến email của bạn! " + result.email,
        result
      )
    );
});

export const resetPassword = handleAsync(async (req, res, next) => {
  const { resetToken, newPassword } = req.body;
  const result = await resetPasswordService(resetToken, newPassword);
  return res
    .status(StatusCodes.OK)
    .json(createResponse("Ok", StatusCodes.OK, result.message));
});

export const verifyResetToken = handleAsync(async (req, res, next) => {
  const { resetToken } = req.body;
  const result = await verifyResetTokenService(resetToken);
  return res
    .status(StatusCodes.OK)
    .json(createResponse("Ok", StatusCodes.OK, result.message, result.user));
});

// export const
