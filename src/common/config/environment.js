import dotenv from 'dotenv';
dotenv.config();

const getEnv = (key, fallback = undefined) => {
    const val = process.env[key];
    if (typeof val === 'string') return val.trim();
    return val !== undefined ? val : fallback;
};

export const NODE_ENV = getEnv('NODE_ENV', 'development');
export const HOST = getEnv('HOST', 'localhost');
export const DB_URI = getEnv('DB_URI');
export const PORT = getEnv('PORT', 10000);
export const CLOUDINARY_CLOUD_NAME = getEnv('CLOUDINARY_CLOUD_NAME');
export const CLOUDINARY_API_KEY = getEnv('CLOUDINARY_API_KEY');
export const CLOUDINARY_API_SECRET = getEnv('CLOUDINARY_API_SECRET');
export const JWT_ACCESS_EXPIRED = getEnv('JWT_ACCESS_EXPIRED', '30d');
export const JWT_ACCESS_SECRET = getEnv('JWT_ACCESS_SECRET');

export const FRONT_END_URL = getEnv('FRONT_END_URL', 'http://localhost:5173');
export const EMAIL = getEnv('EMAIL');
export const EMAIL_PASSWORD = getEnv('EMAIL_PASSWORD');

export const CSRF_SECRET = getEnv('CSRF_SECRET', 'mira_football_csrf_secret_key_2026_super_secure');

export const VNP_TMN_CODE = getEnv('VNP_TMN_CODE');
export const VNP_HASH_SECRET = getEnv('VNP_HASH_SECRET');
export const VNP_URL = getEnv('VNP_URL');
export const VNP_RETURN_URL = getEnv('VNP_RETURN_URL');

export const ZALOPAY_APP_ID = getEnv('ZALOPAY_APP_ID', '2553');
export const ZALOPAY_KEY1 = getEnv('ZALOPAY_KEY1', 'PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL');
export const ZALOPAY_KEY2 = getEnv('ZALOPAY_KEY2', 'kLtgPl8YESDkOklk1AOWG7aP8TAlA1hL');
export const ZALOPAY_ENDPOINT = getEnv('ZALOPAY_ENDPOINT', 'https://sb-openapi.zalopay.vn/v2/create');
export const ZALOPAY_CALLBACK_URL = getEnv('ZALOPAY_CALLBACK_URL');

export const BANK_BIN = getEnv('BANK_BIN', '970423');
export const BANK_ACCOUNT_NUMBER = getEnv('BANK_ACCOUNT_NUMBER', '00000847022');
export const BANK_ACCOUNT_NAME = getEnv('BANK_ACCOUNT_NAME', 'TRINH QUOC HUNG');

export const GEMINI_API_KEY = getEnv('GEMINI_API_KEY');

// Backward compatibility alias if needed
export const JWT_ACCESS_SECRECT = JWT_ACCESS_SECRET;
