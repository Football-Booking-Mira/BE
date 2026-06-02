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
    params: async (req, file) => {
        // Loại bỏ dấu tiếng Việt, ký tự đặc biệt và khoảng trắng khỏi tên file
        const cleanName = (file.originalname || 'file')
            .split('.')[0]
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Xoá dấu tiếng Việt
            .replace(/đ/g, 'd').replace(/Đ/g, 'd')
            .replace(/[^a-zA-Z0-9]/g, '-') // Thay ký tự đặc biệt bằng gạch ngang
            .replace(/-+/g, '-') // Thu gọn gạch ngang liền nhau
            .replace(/^-|-$/g, '') // Xoá gạch ngang ở đầu/cuối
            .toLowerCase();

        return {
            folder: 'courts',
            public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}-${cleanName || 'avatar'}`,
        };
    },
});

// Bộ lọc định dạng ảnh bằng Multer cục bộ trước khi upload lên Cloudinary
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Định dạng tệp không được hỗ trợ! Vui lòng chọn ảnh JPG, JPEG, PNG, WEBP.'), false);
    }
};

const upload = multer({ 
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // Giới hạn kích thước ảnh 5MB
    }
});

export default upload;
