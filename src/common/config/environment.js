import dotenv from 'dotenv';
dotenv.config();

const getEnv = (key) => {
    const val = process.env[key];
    return typeof val === 'string' ? val.trim() : val;
};

export const HOST = getEnv('HOST');
export const DB_URI = getEnv('DB_URI');
export const PORT = getEnv('PORT');
export const CLOUDINARY_CLOUD_NAME = getEnv('CLOUDINARY_CLOUD_NAME');
export const CLOUDINARY_API_KEY = getEnv('CLOUDINARY_API_KEY');
export const CLOUDINARY_API_SECRET = getEnv('CLOUDINARY_API_SECRET');
export const JWT_ACCESS_EXPIRED = getEnv('JWT_ACCESS_EXPIRED');
export const JWT_ACCESS_SECRET = getEnv('JWT_ACCESS_SECRET');
export const FRONT_END_URL = getEnv('FRONT_END_URL');
export const EMAIL = getEnv('EMAIL');
export const EMAIL_PASSWORD = getEnv('EMAIL_PASSWORD');
export const VNP_TMN_CODE = getEnv('VNP_TMN_CODE');
export const VNP_HASH_SECRET = getEnv('VNP_HASH_SECRET');
export const VNP_URL = getEnv('VNP_URL');
export const VNP_RETURN_URL = getEnv('VNP_RETURN_URL');
export const BANK_BIN = getEnv('BANK_BIN');
export const BANK_ACCOUNT_NUMBER = getEnv('BANK_ACCOUNT_NUMBER');
export const BANK_ACCOUNT_NAME = getEnv('BANK_ACCOUNT_NAME');

export const JWT_ACCESS_SECRET_FINAL =
    JWT_ACCESS_SECRET || 'default_secret';
export const JWT_ACCESS_SECRECT = JWT_ACCESS_SECRET_FINAL;
