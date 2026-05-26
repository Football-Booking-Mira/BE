import swaggerAutogen from 'swagger-autogen';
import { HOST, PORT } from './environment.js';
const outputFile = './src/common/config/swagger-output.json';
const endpointsFiles = ['./src/routes/index.js'];
const swaggerConfig = {
    info: {
        title: 'MIRA Football - Backend API',
        description: 'API hệ thống đặt sân bóng đá MIRA Football - By Trịnh Quốc Hùng',
        version: '1.0.0',
    },
    host: `${HOST}:${PORT}`,
    basePath: '/api',
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],

    tags: [
        { name: 'Auth', description: 'Xác thực: Đăng nhập, Đăng ký, Quên mật khẩu' },
        { name: 'Users', description: 'Quản lý người dùng' },
        { name: 'Courts', description: 'Quản lý sân bóng' },
        { name: 'Bookings', description: 'Quản lý đặt sân' },
        { name: 'BookingItems', description: 'Chi tiết từng item trong đơn đặt sân' },
        { name: 'Equipments', description: 'Quản lý thiết bị (thuê/bán)' },
        { name: 'Payment', description: 'Thanh toán VNPay & ZaloPay' },
        { name: 'Invoices', description: 'Quản lý hóa đơn' },
        { name: 'Vouchers', description: 'Quản lý mã giảm giá' },
        { name: 'Reviews', description: 'Đánh giá sân bóng' },
        { name: 'Reports', description: 'Thống kê & Báo cáo' },
        { name: 'Contacts', description: 'Liên hệ & Phản hồi' },
        { name: 'Chat', description: 'AI Chatbot tư vấn' },
        { name: 'Upload', description: 'Upload hình ảnh' },
    ],

    securityDefinitions: {
        BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
        },
    },
};

swaggerAutogen()(outputFile, endpointsFiles, swaggerConfig);
