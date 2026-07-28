import InventoryBatch, { IInventoryBatch } from "../models/inventoryBatch.model";
import Medicine from "../models/medicine.model";
import { AppError } from "../middleware/error.middleware";
import { withMongoTransaction } from "../utils/transaction";

export class InventoryBatchService {
  async createBatch(data: {
    medicineId: string;
    batchNumber: string;
    quantityReceived: number;
    expiryDate?: Date;
    supplier?: string;
    receivedAt?: Date;
    notes?: string;
    receivedBy: string;
  }): Promise<IInventoryBatch> {
    return withMongoTransaction(async (session) => {
      const medicineQuery = Medicine.findById(data.medicineId);
      if (session) medicineQuery.session(session);
      const medicine = await medicineQuery;
      if (!medicine) throw new AppError("Medicine not found", 404);

      const [batch] = await InventoryBatch.create([{
        ...data,
        quantityRemaining: data.quantityReceived,
      }], session ? { session } : {});
      if (!batch) throw new Error("Inventory batch was not created");

      await Medicine.findByIdAndUpdate(data.medicineId, {
        $inc: { quantity: data.quantityReceived },
        $set: { lastUpdatedBy: data.receivedBy },
      }, session ? { session } : {});
      return batch;
    });
  }

  async getBatches(medicineId: string): Promise<IInventoryBatch[]> {
    return InventoryBatch.find({ medicineId })
      .populate("receivedBy", "name role")
      .sort({ expiryDate: 1, receivedAt: 1 });
  }
}
