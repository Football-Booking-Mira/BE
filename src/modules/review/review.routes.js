// routes/review.routes.js

import { Router } from 'express';
import {
    createReview,
    getMyReviews,
    adminGetReviews,
    updateReview,
    deleteReview,
    getFieldsNeedReview,
} from "./review.controller.js";
import { authenticate, authorize } from "../../common/middlewares/auth.middleware.js";

const routerReview = Router();

// USER
routerReview.post("/", authenticate, createReview);
routerReview.get("/my", authenticate, getMyReviews);
routerReview.get("/need-review/:id", authenticate, getFieldsNeedReview);
routerReview.put("/:id", authenticate, updateReview);
routerReview.delete("/:id", authenticate, deleteReview);

// ADMIN
routerReview.get("/admin/list", authenticate, authorize('admin'), adminGetReviews);

export default routerReview;
