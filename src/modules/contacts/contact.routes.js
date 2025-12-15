import { Router } from "express";
import ContactController from "./contact.controller.js";

const router = Router();

router.post("/", ContactController.create);
router.get("/", ContactController.getAll);

export default router;
