import express from "express";

import {
  createPurchaseRequest,
  getPurchaseRequests,
  getPurchaseRequestById,
  reviewPurchaseRequest,
} from "../controllers/purchaseRequest.controller";

import { protect } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createPurchaseRequestSchema, reviewPurchaseRequestSchema } from "../validators/schemas";

const router = express.Router();


// Nurse only - submit a restock request for a low-stock/out-of-stock item
router.post(
  "/",
  protect,
  allowRoles("nurse"),
  validateBody(createPurchaseRequestSchema),
  createPurchaseRequest
);


// Nurse + Admin - view all requests (optionally ?status=pending|approved|rejected)
router.get(
  "/",
  protect,
  allowRoles("nurse", "admin"),
  getPurchaseRequests
);


// Nurse + Admin - view single request
router.get(
  "/:id",
  protect,
  allowRoles("nurse", "admin"),
  getPurchaseRequestById
);


// Admin only - approve or reject a pending request
router.put(
  "/:id/review",
  protect,
  allowRoles("admin"),
  validateBody(reviewPurchaseRequestSchema),
  reviewPurchaseRequest
);

export default router;