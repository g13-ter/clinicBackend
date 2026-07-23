import PurchaseRequest, { IPurchaseRequest, PurchaseRequestStatus } from "../models/purchaseRequest.model";
import Medicine from "../models/medicine.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";

export class PurchaseRequestService {
  async createRequest(data: {
    medicineId: string;
    quantityRequested: number;
    reason: string;
    requestedBy: any;
  }): Promise<IPurchaseRequest> {
    const medicine = await Medicine.findById(data.medicineId);

    if (!medicine) {
      throw new AppError("Medicine not found", 404);
    }

    return await PurchaseRequest.create({
      medicineId: medicine._id,
      itemName: medicine.name,
      quantityRequested: data.quantityRequested,
      reason: data.reason,
      requestedBy: data.requestedBy,
    });
  }

  async getRequests(
    { limit, skip }: PaginationParams,
    status?: PurchaseRequestStatus
  ): Promise<{ requests: IPurchaseRequest[]; total: number }> {
    const filter: any = {};
    if (status) filter.status = status;

    const [requests, total] = await Promise.all([
      PurchaseRequest.find(filter)
        .populate("medicineId", "name unit")
        .populate("requestedBy", "name role")
        .populate("reviewedBy", "name role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PurchaseRequest.countDocuments(filter),
    ]);

    return { requests, total };
  }

  async getRequestById(id: string): Promise<IPurchaseRequest> {
    const purchaseRequest = await PurchaseRequest.findById(id)
      .populate("medicineId", "name unit")
      .populate("requestedBy", "name role")
      .populate("reviewedBy", "name role");

    if (!purchaseRequest) {
      throw new AppError("Purchase request not found", 404);
    }

    return purchaseRequest;
  }

  // Admin approves or rejects a pending request. Once decided, a request is
  // final - it cannot be reviewed again (mirrors the real workflow: the
  // decision has already been acted on outside the system).
  async reviewRequest(
    id: string,
    data: { status: "approved" | "rejected"; reviewNotes?: string; reviewedBy: any }
  ): Promise<{ before: IPurchaseRequest; after: IPurchaseRequest }> {
    const before = await PurchaseRequest.findById(id);

    if (!before) {
      throw new AppError("Purchase request not found", 404);
    }

    if (before.status !== "pending") {
      throw new AppError(`This request has already been ${before.status}`, 400);
    }

    const updatePayload: any = {
      status: data.status,
      reviewedBy: data.reviewedBy,
      reviewedAt: new Date(),
    };
    if (data.reviewNotes !== undefined) updatePayload.reviewNotes = data.reviewNotes;

    const after = await PurchaseRequest.findByIdAndUpdate(id, updatePayload, {
      returnDocument: "after",
      runValidators: true,
    });

    if (!after) {
      throw new AppError("Purchase request not found", 404);
    }

    return { before, after };
  }
}