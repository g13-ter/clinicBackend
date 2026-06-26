import ClinicVisit, { IClinicVisit } from "../models/clinicVisit.model";
import { AppError } from "../middleware/error.middleware";

export class ClinicVisitService {
  async createVisit(data: Partial<IClinicVisit>): Promise<IClinicVisit> {
    return await ClinicVisit.create(data);
  }

  async getVisitsByPatient(patientId: string): Promise<IClinicVisit[]> {
    if (!patientId) {
      throw new AppError("Patient ID is required", 400);
    }

    return await ClinicVisit.find({ patientId, isActive: true })
      .populate("patientId")
      .sort({ visitDate: -1 });
  }

  async getVisitById(id: string): Promise<IClinicVisit> {
    const visit = await ClinicVisit.findById(id).populate("patientId");

    if (!visit) {
      throw new AppError("Clinic visit not found", 404);
    }

    return visit;
  }

  async updateVisit(id: string, data: Partial<IClinicVisit>): Promise<IClinicVisit> {
    const visit = await ClinicVisit.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!visit) {
      throw new AppError("Clinic visit not found", 404);
    }

    return visit;
  }

  async archiveVisit(id: string): Promise<IClinicVisit> {
    const visit = await ClinicVisit.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!visit) {
      throw new AppError("Clinic visit not found", 404);
    }

    return visit;
  }
}
