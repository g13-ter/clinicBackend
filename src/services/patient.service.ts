import Patient, { IPatient } from "../models/patient.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";
import { Types } from "mongoose";

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
    return await Patient.create(data);
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

  async importPatients(
    students: Partial<IPatient>[],
    createdBy: Types.ObjectId,
  ): Promise<{ created: number; duplicates: string[] }> {
    const normalized = students.map((student) => ({
      ...student,
      studentId: student.studentId?.trim(),
      createdBy,
    }));
    const requestedIds = normalized
      .map((student) => student.studentId)
      .filter((studentId): studentId is string => Boolean(studentId));
    const existing = await Patient.find({ studentId: { $in: requestedIds } })
      .select("studentId")
      .lean();
    const duplicateSet = new Set(existing.map((student) => student.studentId));
    const seen = new Set<string>();
    const toCreate = normalized.filter((student) => {
      if (!student.studentId || duplicateSet.has(student.studentId) || seen.has(student.studentId)) {
        if (student.studentId) duplicateSet.add(student.studentId);
        return false;
      }
      seen.add(student.studentId);
      return true;
    });

    if (toCreate.length > 0) await Patient.insertMany(toCreate, { ordered: false });
    return { created: toCreate.length, duplicates: [...duplicateSet].sort() };
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
