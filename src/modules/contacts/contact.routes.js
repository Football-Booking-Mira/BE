import { Router } from "express";
import ContactController from "./contact.controller.js";
import { authenticate, authorize } from "../../common/middlewares/auth.middleware.js";
import { USER_ROLES } from "../../common/constants/enums.js";
import { contactRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";

const router = Router();

router.post("/",
    // #swagger.tags = ['Contacts']
    // #swagger.summary = 'Tạo liên hệ mới'
    contactRateLimiter,
    ContactController.create
);

router.get("/",
    // #swagger.tags = ['Contacts']
    // #swagger.summary = 'Lấy danh sách tất cả liên hệ'
    authenticate, authorize(USER_ROLES.ADMIN),
    ContactController.getAll
);

export default router;
