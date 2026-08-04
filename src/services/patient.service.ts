import Patient, { IPatient } from "../models/patient.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";
import { Types } from "mongoose";
import type { UserRole } from "../types/roles";

type PatientSearchClause =
  | { firstName: { $regex: string; $options: "i" } }
  | { lastName: { $regex: string; $options: "i" } }
  | { studentId: { $regex: string; $options: "i" } };

interface PatientSearchFilter {
  isActive?: true;
  $or?: PatientSearchClause[];
}

export class PatientService {
  async createPatient(data: Partial<IPatient>): Promise<IPatient> {
    const studentId = data.studentId?.trim().toUpperCase();
    if (!studentId) {
      throw new AppError("Student ID is required", 400);
    }

    const existing = await Patient.exists({
      studentId: { $regex: `^${escapeRegex(studentId)}$`, $options: "i" },
    });
    if (existing) {
      throw new AppError(`Student ID ${studentId} is already registered`, 409);
    }

    try {
      return await Patient.create({ ...data, studentId });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        throw new AppError(`Student ID ${studentId} is already registered`, 409);
      }
      throw error;
    }
  }

  async getPatients(
    includeInactive: boolean,
    { limit, skip }: PaginationParams,
    search?: string
  ): Promise<{ patients: IPatient[]; total: number }> {
    const filter: PatientSearchFilter =
      includeInactive ? {} : { isActive: true };

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
        .populate("clinicalProfileUpdatedBy", "name role")
        .populate("clinicalProfileVerifiedBy", "name role")
        .skip(skip)
        .limit(limit),
      Patient.countDocuments(filter),
    ]);

    return { patients, total };
  }

  async getPatientsBasic(search?: string): Promise<IPatient[]> {
    const filter: PatientSearchFilter = {
      isActive: true,
    };

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
      .populate("updatedBy", "name role")
      .populate("clinicalProfileUpdatedBy", "name role")
      .populate("clinicalProfileVerifiedBy", "name role");

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

    const studentId = data.studentId?.trim().toUpperCase();
    if (studentId) {
      const existing = await Patient.exists({
        _id: { $ne: id },
        studentId: { $regex: `^${escapeRegex(studentId)}$`, $options: "i" },
      });
      if (existing) {
        throw new AppError(`Student ID ${studentId} is already registered`, 409);
      }
      data.studentId = studentId;
    }

    let after: IPatient | null;
    try {
      after = await Patient.findByIdAndUpdate(id, data, {
        returnDocument: "after",
        runValidators: true,
      });
    } catch (error: unknown) {
      if (
        studentId &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        throw new AppError(`Student ID ${studentId} is already registered`, 409);
      }
      throw error;
    }

    if (!after) {
      throw new AppError("Patient not found", 404);
    }

    return { before, after };
  }

  async updateClinicalProfile(
    id: string,
    data: {
      familyHistory?: string;
      pastMedicalHistory?: string;
      allergies: string[];
      currentMedications: string[];
      chronicConditions?: string[];
      notes?: string;
      verified?: boolean;
    },
    userId: Types.ObjectId,
    role: UserRole,
  ): Promise<{ before: IPatient; after: IPatient }> {
    const before = await Patient.findById(id);
    if (!before) throw new AppError("Patient not found", 404);

    const verifyNow = role === "doctor" && data.verified === true;
    const nextAllergies = data.allergies;
    const nextMedications = data.currentMedications;
    const nextConditions = data.chronicConditions ?? before.medicalAlerts?.chronicConditions ?? [];
    const profileChanged =
      (data.familyHistory ?? "") !== (before.familyHistory ?? "") ||
      (data.pastMedicalHistory ?? "") !== (before.pastMedicalHistory ?? "") ||
      JSON.stringify(nextAllergies) !== JSON.stringify(before.medicalAlerts?.allergies ?? []) ||
      JSON.stringify(nextMedications) !== JSON.stringify(before.medicalAlerts?.currentMedications ?? []) ||
      JSON.stringify(nextConditions) !== JSON.stringify(before.medicalAlerts?.chronicConditions ?? []) ||
      (data.notes ?? "") !== (before.medicalAlerts?.notes ?? "");
    const invalidateVerification = !verifyNow && profileChanged;
    const after = await Patient.findByIdAndUpdate(
      id,
      {
        $set: {
          familyHistory: data.familyHistory ?? "",
          pastMedicalHistory: data.pastMedicalHistory ?? "",
          medicalAlerts: {
            allergies: nextAllergies,
            currentMedications: nextMedications,
            chronicConditions: nextConditions,
            notes: data.notes ?? "",
          },
          clinicalProfileUpdatedBy: userId,
          updatedBy: userId,
          ...(verifyNow
            ? {
                clinicalProfileVerifiedBy: userId,
                clinicalProfileVerifiedAt: new Date(),
              }
            : {}),
        },
        ...(invalidateVerification
          ? { $unset: { clinicalProfileVerifiedBy: 1, clinicalProfileVerifiedAt: 1 } }
          : {}),
      },
      { returnDocument: "after", runValidators: true },
    )
      .populate("clinicalProfileUpdatedBy", "name role")
      .populate("clinicalProfileVerifiedBy", "name role");

    if (!after) throw new AppError("Patient not found", 404);
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

  async advanceSchoolYear(
    schoolYear: string,
    graduatingYearLevel: number,
    updatedBy: Types.ObjectId,
  ): Promise<{ promoted: number; graduated: number }> {
    const notProcessedForTargetYear = {
      $or: [
        { schoolYear: { $exists: false } },
        { schoolYear: { $ne: schoolYear } },
      ],
    };
    const graduated = await Patient.updateMany(
      {
        isActive: true,
        yearLevel: { $gte: graduatingYearLevel },
        ...notProcessedForTargetYear,
      },
      {
        $set: {
          isActive: false,
          enrollmentStatus: "graduated",
          schoolYear,
          updatedBy,
        },
      },
    );
    const promoted = await Patient.updateMany(
      {
        isActive: true,
        yearLevel: { $lt: graduatingYearLevel },
        ...notProcessedForTargetYear,
      },
      {
        $inc: { yearLevel: 1 },
        $set: { schoolYear, enrollmentStatus: "active", updatedBy },
      },
    );
    return {
      promoted: promoted.modifiedCount,
      graduated: graduated.modifiedCount,
    };
  }
}
