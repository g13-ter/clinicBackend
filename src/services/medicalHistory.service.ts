import MedicalHistory, { IMedicalHistory } from "../models/medicalHistory.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";

export class MedicalHistoryService {
  async createMedicalHistory(data: Partial<IMedicalHistory>): Promise<IMedicalHistory> {
    return await MedicalHistory.create(data);
  }

  async getHistoryByPatient(
    patientId: string,
    { limit, skip }: PaginationParams
  ): Promise<{ history: IMedicalHistory[]; total: number }> {
    if (!patientId) {
      throw new AppError("Patient ID is required", 400);
    }

    const filter = { patientId };

    const [history, total] = await Promise.all([
      MedicalHistory.find(filter)
        .populate("patientId")
        .populate("recordedBy", "name role")
        .populate("updatedBy", "name role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      MedicalHistory.countDocuments(filter),
    ]);

    return { history, total };
  }

  async getHistoryById(id: string): Promise<IMedicalHistory> {
    const entry = await MedicalHistory.findById(id)
      .populate("patientId")
      .populate("recordedBy", "name role")
      .populate("updatedBy", "name role");

    if (!entry) {
      throw new AppError("Medical history entry not found", 404);
    }

    return entry;
  }

  async updateMedicalHistory(id: string, data: Partial<IMedicalHistory>): Promise<IMedicalHistory> {
    const entry = await MedicalHistory.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!entry) {
      throw new AppError("Medical history entry not found", 404);
    }

    return entry;
  }
}