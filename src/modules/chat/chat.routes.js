import { Router } from 'express';
import { handleChat } from './chat.controller.js';

const chatRouter = Router();

chatRouter.post('/',
    // #swagger.tags = ['Chat']
    // #swagger.summary = 'Gửi tin nhắn chat'
    handleChat
);

export default chatRouter;
