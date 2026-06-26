import Patient, { IPatient } from "../models/patient.model";
import { AppError } from "../middleware/error.middleware";

export class PatientService {
  async createPatient(data: Partial<IPatient>): Promise<IPatient> {
    return await Patient.create(data);
  }

  async getPatients(includeInactive: boolean): Promise<IPatient[]> {
    const filter = includeInactive ? {} : { isActive: true };
    return await Patient.find(filter);
  }

  async getPatientsBasic(): Promise<IPatient[]> {
    return await Patient.find({ isActive: true }).select(
      "studentId firstName lastName course yearLevel"
    );
  }

  async getPatientById(id: string): Promise<IPatient> {
    const patient = await Patient.findById(id);
    if (!patient) {
      throw new AppError("Patient not found", 404);
    }
    return patient;
  }

  async updatePatient(id: string, data: Partial<IPatient>): Promise<IPatient> {
    const patient = await Patient.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!patient) {
      throw new AppError("Patient not found", 404);
    }

    return patient;
  }

  async archivePatient(id: string): Promise<IPatient> {
    const patient = await Patient.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!patient) {
      throw new AppError("Patient not found", 404);
    }

    return patient;
  }
}
