import { Router } from 'express';
import { handleChat } from './chat.controller.js';

const chatRouter = Router();

chatRouter.post('/', handleChat);

export default chatRouter;
