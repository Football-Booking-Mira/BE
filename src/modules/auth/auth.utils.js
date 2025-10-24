import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  JWT_ACCESS_EXPIRED,
  JWT_ACCESS_SECRECT,
} from "../../common/config/environment.js";

export const hashPassword = async (password, saltRounds = 10) => {
  const hashed = await bcrypt.hash(password, saltRounds);
  return hashed;
};

export const generateToken = (payload, exp = "30d") => {
  const secret = JWT_ACCESS_SECRECT || "default_secret";
  const expired = JWT_ACCESS_EXPIRED || exp;
  const token = jwt.sign(payload, secret, { expiresIn: expired });
  return token;
};

export const verifyToken = (token) => {
  const secret = JWT_ACCESS_SECRECT || "default_secret";
  const payload = jwt.verify(token, secret);
  return payload;
};
