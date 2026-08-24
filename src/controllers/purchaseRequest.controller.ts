import { Request, Response, NextFunction } from "express";
import { PurchaseRequestService } from "../services/purchaseRequest.service";
import { UserService } from "../services/user.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { enqueueNotification } from "../services/notificationOutbox.service";
import logger, { errorMetadata } from "../utils/logger";
import type { PurchaseRequestStatus } from "../models/purchaseRequest.model";
import { withMongoTransaction } from "../utils/transaction";

const purchaseRequestService = new PurchaseRequestService();
const userService = new UserService();

// CREATE — nurse submits a restock request for a low-stock/out-of-stock item
export const createPurchaseRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const requestingUser = getAuthenticatedUser(req);
    const { medicineId, itemName, unit, category, inventorySection, quantityRequested, reason } = req.body;

    const purchaseRequest = await purchaseRequestService.createRequest({
      medicineId,
      itemName,
      unit,
      category,
      inventorySection,
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

    // Email failures must not affect the completed request.
    (async () => {
      try {
        const [adminEmails, requester] = await Promise.all([
          userService.getAdminEmails(),
          userService.getUserById(requestingUser.id),
        ]);

        await Promise.all(
          adminEmails.map((to) =>
            enqueueNotification({
              kind: "purchase_request",
              recipient: to,
              dedupeKey: `purchase-request:${purchaseRequest._id}:${to}`,
              payload: {
                itemName: purchaseRequest.itemName,
                quantityRequested: purchaseRequest.quantityRequested,
                requestedByName: requester.name,
                reason: purchaseRequest.reason,
              },
            })
          )
        );
      } catch (emailError) {
        logger.error("purchase_request_notification_enqueue_failed", errorMetadata(emailError));
      }
    })();
  } catch (error) {
    next(error);
  }
};

// GET ALL — optional status filter, not audit-logged
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

    const { after } = await withMongoTransaction(async (session) => {
      const result = await purchaseRequestService.reviewRequest(id, { status, reviewNotes, reviewedBy: getAuthenticatedObjectId(req) }, session);
      await logAudit({ action: "update", resource: "PurchaseRequest", resourceId: id, performedBy: userId, before: result.before.toObject(), after: result.after.toObject(), method: req.method, path: req.originalUrl, ...(session ? { session } : {}), required: true });
      return result;
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

export const markPurchaseRequestOrdered = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const { after } = await withMongoTransaction(async (session) => {
      const result = await purchaseRequestService.markOrdered(req.params.id as string, { ...req.body, reviewedBy: getAuthenticatedObjectId(req) }, session);
      await logAudit({ action: "update", resource: "PurchaseRequest", resourceId: String(result.after._id), performedBy: user.id, before: result.before.toObject(), after: result.after.toObject(), method: req.method, path: req.originalUrl, ...(session ? { session } : {}), required: true });
      return result;
    });
    res.status(200).json({ success: true, message: "Purchase request marked as ordered", data: after });
  } catch (error) {
    next(error);
  }
};

export const cancelPurchaseRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const { after } = await withMongoTransaction(async (session) => {
      const result = await purchaseRequestService.cancelRequest(req.params.id as string, { reviewNotes: req.body.reviewNotes, reviewedBy: getAuthenticatedObjectId(req) }, session);
      await logAudit({ action: "update", resource: "PurchaseRequest", resourceId: String(result.after._id), performedBy: user.id, before: result.before.toObject(), after: result.after.toObject(), method: req.method, path: req.originalUrl, ...(session ? { session } : {}), required: true });
      return result;
    });
    res.status(200).json({
      success: true,
      message: "Purchase request cancelled",
      data: after,
    });
  } catch (error) {
    next(error);
  }
};

export const receivePurchaseRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = getAuthenticatedUser(req);
    const result = await purchaseRequestService.receiveRequest(req.params.id as string, {
      ...req.body,
      receivedBy: getAuthenticatedObjectId(req),
    });
    await logAudit({ action: "update", resource: "PurchaseRequest", resourceId: String(result.after._id), performedBy: user.id, before: result.before.toObject(), after: result.after.toObject(), method: req.method, path: req.originalUrl });
    res.status(200).json({
      success: true,
      message: "Delivery received and inventory updated",
      data: result.after,
    });
  } catch (error) {
    next(error);
  }
};
