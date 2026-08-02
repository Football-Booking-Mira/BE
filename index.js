import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookie from 'cookie';

import routes from './src/routes/index.js';
import { notFoundMiddleware } from './src/common/middlewares/notfound.middleware.js';
import { errorMiddleware } from './src/common/middlewares/error.middleware.js';
import { FRONT_END_URL, HOST, PORT, NODE_ENV } from './src/common/config/environment.js';
import { connectDB } from './src/common/config/database.js';
import setupSwagger from './src/common/config/swagger-config.js';
import csrfProtection from './src/common/middlewares/csrf.middleware.js';
import { verifyToken } from './src/modules/auth/auth.utils.js';
import startAutoCancelJob from './src/jobs/autoCancelJob.js';

connectDB();

const app = express();

// Enable reverse proxy trust (for Render/Vercel behind Cloudflare/reverse proxies)
app.set('trust proxy', 1);

// Security Headers Middleware (Helmet equivalent)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

app.disable('x-powered-by');

// Express Body Parsers with 1MB limit to prevent DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

const allowedOrigins = [
    FRONT_END_URL,
    'http://localhost:5173',
    'http://localhost:3000',
    'https://fe-git-dev-trinhquochungwork-sources-projects.vercel.app',
].filter(Boolean);

// Dynamic Origin Validation Helper (supports localhost, configured URLs, & Vercel preview domains)
const isAllowedOrigin = (origin) => {
    if (!origin) return true; // Server-to-server, Postman, mobile apps
    if (allowedOrigins.includes(origin)) return true;
    if (allowedOrigins.some((allowed) => allowed && origin.startsWith(allowed))) return true;
    // Allow all Vercel deployment preview subdomains for this project (*.vercel.app)
    if (origin.endsWith('.vercel.app')) return true;
    return false;
};

// CORS Middleware Configuration
app.use(
    cors({
        origin: function (origin, callback) {
            if (isAllowedOrigin(origin)) {
                callback(null, true);
            } else {
                // Pass false instead of Error object so cors middleware sets proper response headers for preflight OPTIONS
                callback(null, false);
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'X-CSRF-Token',
        ],
        exposedHeaders: ['X-CSRF-Token'],
    })
);

app.use(morgan('dev'));

// Apply CSRF Protection middleware globally for browser sessions
app.use(csrfProtection);

app.use('/api', routes);
app.get('/ping', (req, res) => res.send('pong'));

setupSwagger(app);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

// Create HTTP server & Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: function (origin, callback) {
            if (isAllowedOrigin(origin)) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        },
        credentials: true,
    },
});

// Socket.IO Handshake Authentication Middleware
io.use((socket, next) => {
    try {
        const rawCookies = socket.handshake.headers.cookie;
        let token = null;

        if (rawCookies) {
            const parsed = cookie.parse(rawCookies);
            token = parsed.access_token;
        }

        if (!token && socket.handshake.auth?.token) {
            token = socket.handshake.auth.token;
        }

        if (!token) {
            socket.user = null;
            return next();
        }

        const decoded = verifyToken(token);
        socket.user = decoded;
        next();
    } catch (err) {
        socket.user = null;
        next();
    }
});

// Store socket instance in app
app.set('io', io);

// Start auto-cancel job for expired pending bookings
startAutoCancelJob(app);

// Listen on HTTP server
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
