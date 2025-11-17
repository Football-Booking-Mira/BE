import dotenv from 'dotenv';
dotenv.config();

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
    VNP_TMN_CODE,
    VNP_HASH_SECRET,
    VNP_URL,
    VNP_RETURN_URL,
} = process.env;
