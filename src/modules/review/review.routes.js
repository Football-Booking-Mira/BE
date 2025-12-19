import { authenticate, authorize } from "../../common/middlewares/auth.middleware.js";
import { Router } 
from 'express';
const routerReview = Router();
import {
    createReview,
    getMyReviews,
    adminGetReviews,
    updateReview,
    deleteReview,
    getFieldsNeedReview,
    getReviewDetail,
    getReviewsByCourt,
    updateReviewStatus,
} from "./review.controller.js";
// 
routerReview.get("/need-review/:id", 
    authenticate, getFieldsNeedReview);
routerReview.delete("/:id", 
    authenticate, deleteReview);
routerReview.put("/:id",
     authenticate, updateReview);
routerReview.post("/", 
    authenticate, createReview);
routerReview.get("/admin/list", 
    authenticate, authorize('admin'), adminGetReviews);
routerReview.get("/my", 
    authenticate, getMyReviews);
routerReview.get(
    "/:id",
    authenticate,
    getReviewDetail
);
routerReview.get("/court-pulic/:courtId", getReviewsByCourt);
routerReview.patch(
    "/:id/status",
    authenticate,
    authorize("admin"),
    updateReviewStatus
);

// 
export default 
routerReview;
