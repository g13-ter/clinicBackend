import mongoose from "mongoose";
import InventoryLabel, { type IInventoryLabel } from "../models/inventoryLabel.model";
import Medicine from "../models/medicine.model";
import { AppError } from "../middleware/error.middleware";
import { withMongoTransaction } from "../utils/transaction";
import { escapeRegex } from "../utils/regex";

export const STANDARD_INVENTORY_LABELS = [
  "Tablet Form", "Nebulization", "Emergency Medications", "External Medications",
  "Topical Medications", "Non-Medication Treatments", "Medical Supplies", "Others",
] as const;

const normalize = (name: string): string => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export class InventoryLabelService {
  async syncExisting(userId: string): Promise<void> {
    const medicineLabels = await Medicine.distinct("inventorySection", { inventorySection: { $type: "string", $ne: "" } });
    const names = [...STANDARD_INVENTORY_LABELS, ...medicineLabels.map((value) => value.trim()).filter(Boolean)];
    for (const [index, name] of [...new Set(names)].entries()) {
      await InventoryLabel.updateOne(
        { normalizedName: normalize(name) },
        { $setOnInsert: { name, normalizedName: normalize(name), sortOrder: index, isActive: true, isSystem: STANDARD_INVENTORY_LABELS.includes(name as typeof STANDARD_INVENTORY_LABELS[number]), createdBy: userId } },
        { upsert: true },
      );
    }
  }

  async list(userId: string, includeArchived = false) {
    await this.syncExisting(userId);
    const labels = await InventoryLabel.find(includeArchived ? {} : { isActive: true }).sort({ sortOrder: 1, name: 1 });
    const counts = await Medicine.aggregate<{ _id: string; count: number }>([
      { $match: { isActive: true, inventorySection: { $type: "string" } } },
      { $group: { _id: { $toLower: { $trim: { input: "$inventorySection" } } }, count: { $sum: 1 } } },
    ]);
    const byName = new Map(counts.map((item) => [item._id, item.count]));
    return labels.map((label) => ({ ...label.toObject(), itemCount: byName.get(label.normalizedName) ?? 0 }));
  }

  async create(data: { name: string; description?: string; color?: string }, userId: string): Promise<IInventoryLabel> {
    const name = data.name.trim().replace(/\s+/g, " ");
    if (await InventoryLabel.exists({ normalizedName: normalize(name) })) throw new AppError("A label with this name already exists", 409);
    const highest = await InventoryLabel.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();
    return InventoryLabel.create({ ...data, name, normalizedName: normalize(name), sortOrder: (highest?.sortOrder ?? -1) + 1, createdBy: userId });
  }

  async update(id: string, data: { name?: string; description?: string; color?: string }): Promise<{ before: IInventoryLabel; after: IInventoryLabel }> {
    const before = await InventoryLabel.findById(id);
    if (!before) throw new AppError("Inventory label not found", 404);
    const update: Record<string, unknown> = { ...data };
    if (data.name) {
      const name = data.name.trim().replace(/\s+/g, " ");
      if (before.isSystem && normalize(name) !== before.normalizedName) {
        throw new AppError("Standard label names cannot be changed", 409);
      }
      const duplicate = await InventoryLabel.exists({ _id: { $ne: id }, normalizedName: normalize(name) });
      if (duplicate) throw new AppError("A label with this name already exists", 409);
      update.name = name;
      update.normalizedName = normalize(name);
      await Medicine.updateMany(
        { inventorySection: { $regex: `^${escapeRegex(before.name)}$`, $options: "i" } },
        { $set: { inventorySection: name } },
      );
    }
    const after = await InventoryLabel.findByIdAndUpdate(id, update, { returnDocument: "after", runValidators: true });
    if (!after) throw new AppError("Inventory label not found", 404);
    return { before, after };
  }

  async reorder(ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) throw new AppError("Label order contains duplicates", 400);
    await Promise.all(ids.map((id, index) => InventoryLabel.updateOne({ _id: id, isActive: true }, { $set: { sortOrder: index } })));
  }

  async assign(labelId: string, medicineIds: string[], userId: string): Promise<number> {
    const label = await InventoryLabel.findOne({ _id: labelId, isActive: true });
    if (!label) throw new AppError("Active inventory label not found", 404);
    const result = await Medicine.updateMany({ _id: { $in: medicineIds }, isActive: true }, { $set: { inventorySection: label.name, lastUpdatedBy: userId } });
    return result.modifiedCount;
  }

  async archive(id: string, userId: string): Promise<IInventoryLabel> {
    const label = await InventoryLabel.findById(id);
    if (!label) throw new AppError("Inventory label not found", 404);
    if (label.isSystem) throw new AppError("Standard labels cannot be archived", 409);
    const itemCount = await Medicine.countDocuments({ isActive: true, inventorySection: { $regex: `^${escapeRegex(label.name)}$`, $options: "i" } });
    if (itemCount > 0) throw new AppError(`Move the ${itemCount} item(s) in this label before archiving it`, 409);
    label.isActive = false;
    label.archivedAt = new Date();
    label.archivedBy = new mongoose.Types.ObjectId(userId);
    await label.save();
    return label;
  }

  async merge(sourceId: string, targetId: string, userId: string): Promise<{ source: IInventoryLabel; target: IInventoryLabel; moved: number }> {
    if (sourceId === targetId) throw new AppError("Choose two different labels", 400);
    return withMongoTransaction(async (session) => {
      const query = InventoryLabel.find({ _id: { $in: [sourceId, targetId] }, isActive: true });
      if (session) query.session(session);
      const labels = await query;
      const source = labels.find((label) => String(label._id) === sourceId);
      const target = labels.find((label) => String(label._id) === targetId);
      if (!source || !target) throw new AppError("Both labels must be active", 404);
      if (source.isSystem) throw new AppError("Standard labels cannot be merged or archived", 409);
      const result = await Medicine.updateMany(
        { inventorySection: { $regex: `^${escapeRegex(source.name)}$`, $options: "i" } },
        { $set: { inventorySection: target.name, lastUpdatedBy: userId } },
        session ? { session } : {},
      );
      source.isActive = false;
      source.archivedAt = new Date();
      source.archivedBy = new mongoose.Types.ObjectId(userId);
      await source.save(session ? { session } : {});
      return { source, target, moved: result.modifiedCount };
    });
  }
}
