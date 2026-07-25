import Patient, { IPatient } from "../models/patient.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";

export class PatientService {
  async createPatient(data: Partial<IPatient>): Promise<IPatient> {
    return await Patient.create(data);
  }

  async getPatients(
    includeInactive: boolean,
    { limit, skip }: PaginationParams,
    search?: string
  ): Promise<{ patients: IPatient[]; total: number }> {
    const filter: any = includeInactive ? {} : { isActive: true };

    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { firstName: { $regex: safeSearch, $options: "i" } },
        { lastName: { $regex: safeSearch, $options: "i" } },
        { studentId: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [patients, total] = await Promise.all([
      Patient.find(filter)
        .populate("createdBy", "name role")
        .populate("updatedBy", "name role")
        .skip(skip)
        .limit(limit),
      Patient.countDocuments(filter),
    ]);

    return { patients, total };
  }

  async getPatientsBasic(search?: string): Promise<IPatient[]> {
    const filter: any = { isActive: true };

    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { firstName: { $regex: safeSearch, $options: "i" } },
        { lastName: { $regex: safeSearch, $options: "i" } },
        { studentId: { $regex: safeSearch, $options: "i" } },
      ];
    }

    return await Patient.find(filter).select(
      "studentId firstName lastName course yearLevel"
    );
  }

  async getPatientById(id: string): Promise<IPatient> {
    const patient = await Patient.findById(id)
      .populate("createdBy", "name role")
      .populate("updatedBy", "name role");

    if (!patient) {
      throw new AppError("Patient not found", 404);
    }
    return patient;
  }

  async updatePatient(id: string, data: Partial<IPatient>): Promise<{ before: IPatient; after: IPatient }> {
    const before = await Patient.findById(id);

    if (!before) {
      throw new AppError("Patient not found", 404);
    }

    const after = await Patient.findByIdAndUpdate(id, data, {
      returnDocument: "after",
      runValidators: true,
    });

    if (!after) {
      throw new AppError("Patient not found", 404);
    }

    return { before, after };
  }

  async archivePatient(id: string, updatedBy: string): Promise<{ before: IPatient; after: IPatient }> {
    const before = await Patient.findById(id);

    if (!before) {
      throw new AppError("Patient not found", 404);
    }

    const after = await Patient.findByIdAndUpdate(
      id,
      { isActive: false, updatedBy },
      { returnDocument: "after" }
    );

    if (!after) {
      throw new AppError("Patient not found", 404);
    }

    return { before, after };
  }
}