import { Router } from 'express';
import upload from '../middlewares/upload.middleware.js';
import createResponse from '../../utils/responses.js';

const router = Router();

// field name = "avatar"
router.post('/avatar', upload.single('avatar'), (req, res) => {
    if (!req.file || !req.file.path) {
        return res.status(400).json(createResponse(false, 400, 'Upload avatar thất bại!', null));
    }

    return res.json(
        createResponse(true, 200, 'Upload avatar thành công!', {
            url: req.file.path,
        })
    );
});

export default router;
