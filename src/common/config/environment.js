import dotenv from 'dotenv';

dotenv.config({});

export const {
    HOST,
    DB_URI,
    PORT,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    JWT_ACCESS_EXPIRED,
    JWT_ACCESS_SECRECT,
    FRONT_END_URL,
    EMAIL,
    EMAIL_PASSWORD,
    VNP_TMNCODE,
    VNP_HASHSECRET,
    VNP_URL,
} = process.env;
