import { Router } from "express";
import ContactController from "./contact.controller.js";

const router = Router();

router.post("/",
    // #swagger.tags = ['Contacts']
    // #swagger.summary = 'Tạo liên hệ mới'
    ContactController.create
);

router.get("/",
    // #swagger.tags = ['Contacts']
    // #swagger.summary = 'Lấy danh sách tất cả liên hệ'
    ContactController.getAll
);

export default router;
