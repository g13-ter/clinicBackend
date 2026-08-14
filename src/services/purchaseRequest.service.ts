import PurchaseRequest, { IPurchaseRequest, PurchaseRequestStatus } from "../models/purchaseRequest.model";
import Medicine from "../models/medicine.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { Types } from "mongoose";
import InventoryBatch from "../models/inventoryBatch.model";
import StockMovement from "../models/stockMovement.model";
import { assertInventoryPeriodOpen } from "./monthlyInventory.service";
import { withMongoTransaction } from "../utils/transaction";

interface CreatePurchaseRequestInput {
  medicineId?: string;
  itemName?: string;
  unit?: string;
  category?: string;
  inventorySection?: string;
  quantityRequested: number;
  reason: string;
  requestedBy: Types.ObjectId;
}

interface ReviewPurchaseRequestInput {
  status: "approved" | "rejected";
  reviewNotes?: string;
  reviewedBy: Types.ObjectId;
}

interface PurchaseRequestFilter {
  status?: PurchaseRequestStatus;
}

export class PurchaseRequestService {
  async createRequest(data: CreatePurchaseRequestInput): Promise<IPurchaseRequest> {
    if (data.medicineId) {
      const medicine = await Medicine.findById(data.medicineId);
      if (!medicine) throw new AppError("Medicine not found", 404);

      return await PurchaseRequest.create({
        medicineId: medicine._id,
        requestType: "restock",
        itemName: medicine.name,
        unit: medicine.unit,
        ...(medicine.category ? { category: medicine.category } : {}),
        ...(medicine.inventorySection ? { inventorySection: medicine.inventorySection } : {}),
        quantityRequested: data.quantityRequested,
        reason: data.reason,
        requestedBy: data.requestedBy,
      });
    }

    if (!data.itemName?.trim() || !data.unit?.trim()) {
      throw new AppError("Item name and unit are required for a new item", 400);
    }

    return await PurchaseRequest.create({
      requestType: "new_item",
      itemName: data.itemName.trim(),
      unit: data.unit.trim(),
      ...(data.category?.trim() ? { category: data.category.trim() } : {}),
      ...(data.inventorySection?.trim() ? { inventorySection: data.inventorySection.trim() } : {}),
      quantityRequested: data.quantityRequested,
      reason: data.reason,
      requestedBy: data.requestedBy,
    });
  }

  async getRequests(
    { limit, skip }: PaginationParams,
    status?: PurchaseRequestStatus
  ): Promise<{ requests: IPurchaseRequest[]; total: number }> {
    const filter: PurchaseRequestFilter = {};
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

  // Review decisions are final.
  async reviewRequest(
    id: string,
    data: ReviewPurchaseRequestInput,
  ): Promise<{ before: IPurchaseRequest; after: IPurchaseRequest }> {
    const before = await PurchaseRequest.findById(id);

    if (!before) {
      throw new AppError("Purchase request not found", 404);
    }

    if (before.status !== "pending") {
      throw new AppError(`This request has already been ${before.status}`, 400);
    }

    const updatePayload: Partial<IPurchaseRequest> = {
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

  async markOrdered(
    id: string,
    data: { supplier?: string; estimatedCost?: number; reviewedBy: Types.ObjectId },
  ): Promise<{ before: IPurchaseRequest; after: IPurchaseRequest }> {
    const before = await PurchaseRequest.findById(id);
    if (!before) throw new AppError("Purchase request not found", 404);
    if (before.status !== "approved") {
      throw new AppError("Only an approved request can be marked ordered", 409);
    }
    const after = await PurchaseRequest.findOneAndUpdate(
      { _id: id, status: "approved" },
      {
        status: "ordered",
        orderedAt: new Date(),
        reviewedBy: data.reviewedBy,
        ...(data.supplier ? { supplier: data.supplier } : {}),
        ...(data.estimatedCost !== undefined ? { estimatedCost: data.estimatedCost } : {}),
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!after) throw new AppError("Purchase request status changed. Refresh and try again.", 409);
    return { before, after };
  }

  async cancelRequest(
    id: string,
    data: { reviewNotes?: string; reviewedBy: Types.ObjectId },
  ): Promise<{ before: IPurchaseRequest; after: IPurchaseRequest }> {
    const before = await PurchaseRequest.findById(id);
    if (!before) throw new AppError("Purchase request not found", 404);
    if (!["pending", "approved", "ordered"].includes(before.status)) {
      throw new AppError(`A ${before.status} request cannot be cancelled`, 409);
    }

    const after = await PurchaseRequest.findOneAndUpdate(
      { _id: id, status: { $in: ["pending", "approved", "ordered"] } },
      {
        status: "cancelled",
        reviewedBy: data.reviewedBy,
        reviewedAt: new Date(),
        ...(data.reviewNotes ? { reviewNotes: data.reviewNotes } : {}),
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!after) {
      throw new AppError("Purchase request status changed. Refresh and try again.", 409);
    }
    return { before, after };
  }

  async receiveRequest(
    id: string,
    data: {
      batchNumber: string;
      quantityReceived: number;
      expiryDate?: Date;
      supplier?: string;
      receivedBy: Types.ObjectId;
    },
  ): Promise<{ before: IPurchaseRequest; after: IPurchaseRequest; medicineId: string }> {
    await assertInventoryPeriodOpen(new Date());
    return withMongoTransaction(async (session) => {
      const requestQuery = PurchaseRequest.findById(id);
      if (session) requestQuery.session(session);
      const before = await requestQuery;
      if (!before) throw new AppError("Purchase request not found", 404);
      if (!["approved", "ordered"].includes(before.status)) {
        throw new AppError("Only an approved or ordered request can be received", 409);
      }

      let medicine = before.medicineId
        ? await Medicine.findById(before.medicineId).session(session ?? null)
        : null;
      if (!medicine) {
        const [createdMedicine] = await Medicine.create([{
          name: before.itemName,
          quantity: 0,
          unit: before.unit || "units",
          lowStockThreshold: 10,
          ...(before.category ? { category: before.category } : {}),
          ...(before.inventorySection ? { inventorySection: before.inventorySection } : {}),
          ...(data.supplier || before.supplier ? { supplier: data.supplier || before.supplier } : {}),
          lastUpdatedBy: data.receivedBy,
        }], session ? { session } : {});
        medicine = createdMedicine ?? null;
      }
      if (!medicine) throw new Error("Received medicine was not created");

      const [receivedBatch] = await InventoryBatch.create([{
        medicineId: medicine._id,
        batchNumber: data.batchNumber,
        quantityReceived: data.quantityReceived,
        quantityRemaining: data.quantityReceived,
        ...(data.expiryDate ? { expiryDate: data.expiryDate } : {}),
        ...(data.supplier || before.supplier ? { supplier: data.supplier || before.supplier } : {}),
        receivedBy: data.receivedBy,
      }], session ? { session } : {});
      if (!receivedBatch) throw new Error("Received inventory batch was not created");
      const updatedMedicine = await Medicine.findByIdAndUpdate(
        medicine._id,
        {
          $inc: { quantity: data.quantityReceived },
          $set: { lastUpdatedBy: data.receivedBy, ...(data.supplier ? { supplier: data.supplier } : {}) },
        },
        { returnDocument: "after", ...(session ? { session } : {}) },
      );
      if (!updatedMedicine) throw new AppError("Medicine not found", 404);
      await StockMovement.create([{
        medicineId: updatedMedicine._id,
        batchId: receivedBatch._id,
        type: "received",
        quantityChange: data.quantityReceived,
        balanceAfter: updatedMedicine.quantity,
        occurredAt: receivedBatch.receivedAt,
        performedBy: data.receivedBy,
        notes: `Received approved purchase request batch ${data.batchNumber}`,
      }], session ? { session } : {});
      const after = await PurchaseRequest.findOneAndUpdate(
        { _id: id, status: { $in: ["approved", "ordered"] } },
        {
          status: "received",
          medicineId: medicine._id,
          receivedAt: new Date(),
          receivedBy: data.receivedBy,
          ...(data.supplier ? { supplier: data.supplier } : {}),
        },
        { returnDocument: "after", ...(session ? { session } : {}) },
      );
      if (!after) throw new AppError("Purchase request status changed. Refresh and try again.", 409);
      return { before, after, medicineId: String(medicine._id) };
    });
  }
}
