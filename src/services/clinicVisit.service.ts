import ClinicVisit, { IClinicVisit } from "../models/clinicVisit.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";

export class ClinicVisitService {
  async createVisit(data: Partial<IClinicVisit>): Promise<IClinicVisit> {
    return await ClinicVisit.create(data);
  }

  async getVisitsByPatient(
    patientId: string,
    { limit, skip }: PaginationParams,
    search?: string
  ): Promise<{ visits: IClinicVisit[]; total: number }> {
    if (!patientId) {
      throw new AppError("Patient ID is required", 400);
    }

    const filter: any = { patientId, isActive: true };

    if (search) {
      filter.complaint = { $regex: escapeRegex(search), $options: "i" };
    }

    const [visits, total] = await Promise.all([
      ClinicVisit.find(filter)
        .populate("patientId")
        .populate("recordedBy", "name role")
        .populate("updatedBy", "name role")
        .sort({ visitDate: -1 })
        .skip(skip)
        .limit(limit),
      ClinicVisit.countDocuments(filter),
    ]);

    return { visits, total };
  }

  async getVisitById(id: string): Promise<IClinicVisit> {
    const visit = await ClinicVisit.findById(id)
      .populate("patientId")
      .populate("recordedBy", "name role")
      .populate("updatedBy", "name role");

    if (!visit) {
      throw new AppError("Clinic visit not found", 404);
    }

    return visit;
  }

  async updateVisit(id: string, data: Partial<IClinicVisit>): Promise<{ before: IClinicVisit; after: IClinicVisit }> {
    const before = await ClinicVisit.findById(id);

    if (!before) {
      throw new AppError("Clinic visit not found", 404);
    }

    const after = await ClinicVisit.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!after) {
      throw new AppError("Clinic visit not found", 404);
    }

    return { before, after };
  }

  async archiveVisit(id: string, updatedBy: string): Promise<{ before: IClinicVisit; after: IClinicVisit }> {
    const before = await ClinicVisit.findById(id);

    if (!before) {
      throw new AppError("Clinic visit not found", 404);
    }

    const after = await ClinicVisit.findByIdAndUpdate(
      id,
      { isActive: false, updatedBy },
      { new: true }
    );

    if (!after) {
      throw new AppError("Clinic visit not found", 404);
    }

    return { before, after };
  }
}