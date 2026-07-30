import { Router } from 'express';
import { handleChat } from './chat.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { chatRateLimiter } from '../../common/middlewares/rateLimit.middleware.js';

const chatRouter = Router();

chatRouter.post('/',
    // #swagger.tags = ['Chat']
    // #swagger.summary = 'Gửi tin nhắn chat'
    authenticate,
    chatRateLimiter,
    handleChat
);

export default chatRouter;
