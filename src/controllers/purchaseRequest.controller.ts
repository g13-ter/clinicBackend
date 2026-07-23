import { Request, Response, NextFunction } from "express";
import { PurchaseRequestService } from "../services/purchaseRequest.service";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { mailer } from "../services/mailer.service";
import logger from "../utils/logger";
import type { PurchaseRequestStatus } from "../models/purchaseRequest.model";

const purchaseRequestService = new PurchaseRequestService();
const userService = new UserService();

// CREATE — nurse submits a restock request for a low-stock/out-of-stock item
export const createPurchaseRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const requestingUser = getAuthenticatedUser(req);
    const { medicineId, quantityRequested, reason } = req.body;

    const purchaseRequest = await purchaseRequestService.createRequest({
      medicineId,
      quantityRequested,
      reason,
      requestedBy: getAuthenticatedObjectId(req),
    });

    logAudit({
      action: "create",
      resource: "PurchaseRequest",
      resourceId: String(purchaseRequest._id),
      performedBy: requestingUser.id,
      after: purchaseRequest.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(201).json({
      success: true,
      message: "Purchase request submitted successfully",
      data: purchaseRequest,
    });

    // Fire-and-forget: response already sent above, email failure must
    // never affect it.
    (async () => {
      try {
        const [adminEmails, requester] = await Promise.all([
          userService.getAdminEmails(),
          userService.getUserById(requestingUser.id),
        ]);

        await Promise.all(
          adminEmails.map((to) =>
            mailer.sendPurchaseRequestSubmitted({
              to,
              itemName: purchaseRequest.itemName,
              quantityRequested: purchaseRequest.quantityRequested,
              requestedByName: requester.name,
              reason: purchaseRequest.reason,
            })
          )
        );
      } catch (emailError) {
        logger.error("Failed to send purchase request notification email:", emailError);
      }
    })();
  } catch (error) {
    next(error);
  }
};

// GET ALL — read-only, not audit-logged. Optional ?status= filter
// (nurse typically checks their own pending requests; admin reviews all).
export const getPurchaseRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = req.query.status as PurchaseRequestStatus | undefined;
    const pagination = getPaginationParams(req.query);

    const { requests, total } = await purchaseRequestService.getRequests(pagination, status);

    res.status(200).json({
      success: true,
      message: "Purchase requests retrieved successfully",
      data: requests,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};

// GET BY ID — read-only, not audit-logged
export const getPurchaseRequestById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const purchaseRequest = await purchaseRequestService.getRequestById(id);

    res.status(200).json({
      success: true,
      message: "Purchase request retrieved successfully",
      data: purchaseRequest,
    });
  } catch (error) {
    next(error);
  }
};

// REVIEW (approve/reject) — admin only
export const reviewPurchaseRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;
    const { status, reviewNotes } = req.body;

    const { before, after } = await purchaseRequestService.reviewRequest(id, {
      status,
      reviewNotes,
      reviewedBy: getAuthenticatedObjectId(req),
    });

    logAudit({
      action: "update",
      resource: "PurchaseRequest",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({
      success: true,
      message: `Purchase request ${status} successfully`,
      data: after,
    });
  } catch (error) {
    next(error);
  }
};