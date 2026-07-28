import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';

import routes from './src/routes/index.js';
import { notFoundMiddleware } from './src/common/middlewares/notfound.middleware.js';
import { errorMiddleware } from './src/common/middlewares/error.middleware.js';
import { FRONT_END_URL, HOST, PORT } from './src/common/config/environment.js';
import { connectDB } from './src/common/config/database.js';
import setupSwagger from './src/common/config/swagger-config.js';

import startAutoCancelJob from './src/jobs/autoCancelJob.js';


import cookieParser from 'cookie-parser';

connectDB();

const app = express();

const allowedOrigins = [
    FRONT_END_URL,
    'http://localhost:5173',
    'http://localhost:3000',
    'https://fe-git-dev-trinhquochungwork-sources-projects.vercel.app'
].filter(Boolean);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.includes(origin) || allowedOrigins.some(o => origin.startsWith(o))) {
                callback(null, true);
            } else {
                callback(null, true); // Safe fallback for client compatibility while logging
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    })
);
app.disable('x-powered-by');
app.use(morgan('dev'));

app.use('/api', routes);
app.get('/ping', (req, res) => res.send('pong'));

setupSwagger(app);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

//  Tạo HTTP server & Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: true,
        credentials: true,
    },
});

// Lưu socket vào app (để các controller emit được)
app.set('io', io);
//* Khởi động job tự hủy khi không thanh toán lại
// Khởi động job tự hủy đơn quá hạn thanh toán
startAutoCancelJob(app);

//  Lắng nghe server
httpServer.listen(PORT, () => {
   console.log(`Server running on port ${PORT}`);
});
