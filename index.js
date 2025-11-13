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
import dotenv from "dotenv";
dotenv.config();

connectDB();

const app = express();
app.use(express.json());
app.use(
    cors({
        origin: 'http://localhost:5173',
        credentials: true,
    })
);
app.use(morgan('dev'));
app.use('/api', routes);
app.use('/ping', (req, res) => res.send('pong'));
setupSwagger(app);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

// Socket.IO setup
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: 'http://localhost:5173',
        credentials: true,
    },
});
app.set('io', io);

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join:court', (courtId) => {
        socket.join(String(courtId));
        console.log(`Client ${socket.id} joined room: ${courtId}`);
    });

    socket.on('leave:court', (courtId) => {
        socket.leave(String(courtId));
        console.log(`Client ${socket.id} left room: ${courtId}`);
    });

    socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

httpServer.listen(PORT, () => {
    console.log(`API + Socket.IO running at http://${HOST}:${PORT}`);
});
