import MedicalHistory, { IMedicalHistory } from "../models/medicalHistory.model";
import { AppError } from "../middleware/error.middleware";

export class MedicalHistoryService {
  async createMedicalHistory(data: Partial<IMedicalHistory>): Promise<IMedicalHistory> {
    return await MedicalHistory.create(data);
  }

  async getHistoryByPatient(patientId: string): Promise<IMedicalHistory[]> {
    if (!patientId) {
      throw new AppError("Patient ID is required", 400);
    }

    return await MedicalHistory.find({ patientId })
      .populate("patientId")
      .populate("recordedBy", "name role")
      .sort({ dateRecorded: -1 });
  }

  async getHistoryById(id: string): Promise<IMedicalHistory> {
    const entry = await MedicalHistory.findById(id)
      .populate("patientId")
      .populate("recordedBy", "name role");

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
