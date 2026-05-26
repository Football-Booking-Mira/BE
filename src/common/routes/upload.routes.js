import { Router } from 'express';
import upload from '../middlewares/upload.middleware.js';
import createResponse from '../../utils/responses.js';

const router = Router();

router.post('/avatar', upload.single('avatar'), (req, res) => {
    // #swagger.tags = ['Upload']
    // #swagger.summary = 'Upload ảnh đại diện'
    if (!req.file || !req.file.path) {
        return res.status(400).json(createResponse(false, 400, 'Upload avatar thất bại!', null));
    }
    return res.json(createResponse(true, 200, 'Upload avatar thành công!', { url: req.file.path }));
});

router.post('/single', upload.single('file'), (req, res) => {
    // #swagger.tags = ['Upload']
    // #swagger.summary = 'Upload một file'
    if (!req.file || !req.file.path) {
        return res.status(400).json(createResponse(false, 400, 'Upload file thất bại!', null));
    }
    return res.status(201).json(createResponse(true, 201, 'Upload file thành công!', { url: req.file.path }));
});

export default router;
