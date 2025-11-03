import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import {
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    CLOUDINARY_CLOUD_NAME,
} from '../config/environment.js';
cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
});
const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
        folder: 'courts',
        resource_type: 'auto',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}-${
            file.originalname.split('.')[0]
        }`,
    }),
});
const upload = multer({ storage });
export default upload;
