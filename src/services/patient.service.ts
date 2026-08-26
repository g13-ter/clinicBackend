import Patient, { IPatient } from "../models/patient.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";
import { QueryFilter, Types } from "mongoose";
import type { UserRole } from "../types/roles";

type PatientSearchClause =
  | { firstName: { $regex: string; $options: "i" } }
  | { lastName: { $regex: string; $options: "i" } }
  | { studentId: { $regex: string; $options: "i" } }
  | { employeeId: { $regex: string; $options: "i" } }
  | { department: { $regex: string; $options: "i" } }
  | { position: { $regex: string; $options: "i" } };

interface PatientSearchFilter {
  isActive?: true;
  patientType?: "student" | "teacher" | "staff";
  $and?: Array<Record<string, unknown>>;
  $or?: PatientSearchClause[];
}

type EducationLevel = NonNullable<IPatient["educationLevel"]>;

const validateAcademicPlacement = (
  educationLevel: EducationLevel,
  yearLevel: number | undefined,
  course: string | undefined,
  programDurationYears: number | undefined,
): void => {
  if (!Number.isInteger(yearLevel)) throw new AppError("Student grade or year level is required", 400);
  if (educationLevel === "college") {
    const duration = programDurationYears ?? 4;
    if (!course?.trim()) throw new AppError("Course is required for college students", 400);
    if (!Number.isInteger(duration) || duration < 1 || duration > 10) {
      throw new AppError("College program length must be between 1 and 10 years", 400);
    }
    if ((yearLevel as number) < 1 || (yearLevel as number) > duration) {
      throw new AppError("College year cannot exceed the program length", 400);
    }
    return;
  }
  const range = educationLevel === "elementary"
    ? { min: 1, max: 6, label: "Elementary grade" }
    : educationLevel === "junior_high"
      ? { min: 7, max: 10, label: "Junior High grade" }
      : { min: 11, max: 12, label: "Senior High grade" };
  if ((yearLevel as number) < range.min || (yearLevel as number) > range.max) {
    throw new AppError(`${range.label} must be between ${range.min} and ${range.max}`, 400);
  }
};

export class PatientService {
  async createPatient(data: Partial<IPatient>): Promise<IPatient> {
    const patientType = data.patientType ?? "student";
    const educationLevel = data.educationLevel ?? "college";
    if (patientType === "student") {
      validateAcademicPlacement(educationLevel, data.yearLevel, data.course, data.programDurationYears);
    }
    const identifier = (patientType === "student" ? data.studentId : data.employeeId)?.trim().toUpperCase();
    if (!identifier) {
      throw new AppError(patientType === "student" ? "Student ID is required" : "Employee ID is required", 400);
    }

    const existing = await Patient.exists({
      $or: [
        { studentId: { $regex: `^${escapeRegex(identifier)}$`, $options: "i" } },
        { employeeId: { $regex: `^${escapeRegex(identifier)}$`, $options: "i" } },
      ],
    });
    if (existing) {
      throw new AppError(`ID ${identifier} is already registered`, 409);
    }

    try {
      const normalizedData: Partial<IPatient> = {
        ...data,
        patientType,
        studentId: identifier,
      };
      if (patientType === "student") {
        normalizedData.educationLevel = educationLevel;
        if (educationLevel === "college") normalizedData.programDurationYears = data.programDurationYears ?? 4;
        else {
          delete normalizedData.course;
          delete normalizedData.programDurationYears;
        }
      } else {
        normalizedData.employeeId = identifier;
        delete normalizedData.educationLevel;
        delete normalizedData.course;
        delete normalizedData.yearLevel;
        delete normalizedData.programDurationYears;
      }
      return await Patient.create(normalizedData);
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        throw new AppError(`ID ${identifier} is already registered`, 409);
      }
      throw error;
    }
  }

  async getPatients(
    includeInactive: boolean,
    { limit, skip }: PaginationParams,
    search?: string,
    patientType?: "student" | "teacher" | "staff",
    sortOrder: "newest" | "oldest" = "newest",
  ): Promise<{ patients: IPatient[]; total: number }> {
    const filter: PatientSearchFilter =
      includeInactive ? {} : { isActive: true };
    if (patientType === "student") {
      filter.$and = [{ $or: [{ patientType: "student" }, { patientType: { $exists: false } }] }];
    } else if (patientType) {
      filter.patientType = patientType;
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { firstName: { $regex: safeSearch, $options: "i" } },
        { lastName: { $regex: safeSearch, $options: "i" } },
        { studentId: { $regex: safeSearch, $options: "i" } },
        { employeeId: { $regex: safeSearch, $options: "i" } },
        { department: { $regex: safeSearch, $options: "i" } },
        { position: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [patients, total] = await Promise.all([
      Patient.find(filter)
        .populate("createdBy", "name role")
        .populate("updatedBy", "name role")
        .populate("clinicalProfileUpdatedBy", "name role")
        .populate("clinicalProfileVerifiedBy", "name role")
        .sort({ createdAt: sortOrder === "oldest" ? 1 : -1, _id: sortOrder === "oldest" ? 1 : -1 })
        .skip(skip)
        .limit(limit),
      Patient.countDocuments(filter),
    ]);

    return { patients, total };
  }

  async getPatientsBasic(search?: string, patientType?: "student" | "teacher" | "staff"): Promise<IPatient[]> {
    const filter: PatientSearchFilter = {
      isActive: true,
    };
    if (patientType === "student") {
      filter.$and = [{ $or: [{ patientType: "student" }, { patientType: { $exists: false } }] }];
    } else if (patientType) {
      filter.patientType = patientType;
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { firstName: { $regex: safeSearch, $options: "i" } },
        { lastName: { $regex: safeSearch, $options: "i" } },
        { studentId: { $regex: safeSearch, $options: "i" } },
        { employeeId: { $regex: safeSearch, $options: "i" } },
        { department: { $regex: safeSearch, $options: "i" } },
        { position: { $regex: safeSearch, $options: "i" } },
      ];
    }

    return await Patient.find(filter).select(
      "patientType educationLevel studentId employeeId firstName lastName course yearLevel programDurationYears department position"
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

    const patientType = data.patientType ?? before.patientType ?? "student";
    const educationLevel = data.educationLevel ?? before.educationLevel ?? "college";
    if (patientType === "student") {
      validateAcademicPlacement(
        educationLevel,
        data.yearLevel ?? before.yearLevel,
        data.course ?? before.course,
        data.programDurationYears ?? before.programDurationYears ?? 4,
      );
    }
    const studentId = (patientType === "student" ? data.studentId : data.employeeId)?.trim().toUpperCase();
    if (studentId) {
      const existing = await Patient.exists({
        _id: { $ne: id },
        studentId: { $regex: `^${escapeRegex(studentId)}$`, $options: "i" },
      });
      if (existing) {
        throw new AppError(`Student ID ${studentId} is already registered`, 409);
      }
      data.studentId = studentId;
      if (patientType !== "student") data.employeeId = studentId;
    }

    const unset: Record<string, 1> = {};
    if (patientType !== "student") {
      unset.educationLevel = 1;
      unset.course = 1;
      unset.yearLevel = 1;
      unset.programDurationYears = 1;
    } else if (educationLevel !== "college") {
      unset.course = 1;
      unset.programDurationYears = 1;
    }
    const setData = { ...data } as Record<string, unknown>;
    for (const field of Object.keys(unset)) delete setData[field];

    let after: IPatient | null;
    try {
      after = await Patient.findByIdAndUpdate(id, {
        $set: {
          ...setData,
          ...(patientType === "student" ? { educationLevel } : {}),
          ...(patientType === "student" && educationLevel === "college" && data.programDurationYears === undefined
            ? { programDurationYears: before.programDurationYears ?? 4 }
            : {}),
        },
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      }, {
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
    updatedBy: Types.ObjectId,
  ): Promise<{
    promoted: number;
    pendingReview: number;
    byEducationLevel: Record<string, { promoted: number; pendingReview: number }>;
  }> {
    const notProcessedForTargetYear = {
      $or: [
        { schoolYear: { $exists: false } },
        { schoolYear: { $ne: schoolYear } },
      ],
    };
    const levels = [
      { key: "elementary", filter: { educationLevel: "elementary" }, completion: 6 },
      { key: "junior_high", filter: { educationLevel: "junior_high" }, completion: 10 },
      { key: "senior_high", filter: { educationLevel: "senior_high" }, completion: 12 },
      {
        key: "college",
        filter: { $or: [{ educationLevel: "college" }, { educationLevel: { $exists: false } }] },
        completion: null,
      },
    ] as const;
    const rolloverEligible = {
      $or: [
        { enrollmentStatus: { $exists: false } },
        { enrollmentStatus: { $in: ["active", "extended"] } },
      ],
    };
    const byEducationLevel: Record<string, { promoted: number; pendingReview: number }> = {};
    let promotedTotal = 0;
    let pendingReviewTotal = 0;

    for (const level of levels) {
      const completionRule = level.completion === null
        ? { $expr: { $gte: ["$yearLevel", { $ifNull: ["$programDurationYears", 4] }] } }
        : { yearLevel: { $gte: level.completion } };
      const promotionRule = level.completion === null
        ? { $expr: { $lt: ["$yearLevel", { $ifNull: ["$programDurationYears", 4] }] } }
        : { yearLevel: { $lt: level.completion } };
      const commonFilter = {
        isActive: true,
        $or: [{ patientType: "student" }, { patientType: { $exists: false } }],
        $and: [notProcessedForTargetYear, level.filter, rolloverEligible],
      } as QueryFilter<IPatient>;
      const pendingReview = await Patient.updateMany(
        { ...commonFilter, ...completionRule } as QueryFilter<IPatient>,
        {
          $set: {
            educationLevel: level.key,
            isActive: true,
            enrollmentStatus: "completion_pending",
            schoolYear,
            updatedBy,
          },
          $unset: {
            completionReviewDecision: "",
            completionReviewNotes: "",
            completionReviewedAt: "",
            completionReviewedBy: "",
          },
        },
      );
      const promoted = await Patient.updateMany(
        { ...commonFilter, ...promotionRule } as QueryFilter<IPatient>,
        {
          $inc: { yearLevel: 1 },
          $set: {
            educationLevel: level.key,
            schoolYear,
            enrollmentStatus: "active",
            updatedBy,
          },
          $unset: {
            completionReviewDecision: "",
            completionReviewNotes: "",
            completionReviewedAt: "",
            completionReviewedBy: "",
          },
        },
      );
      byEducationLevel[level.key] = {
        promoted: promoted.modifiedCount,
        pendingReview: pendingReview.modifiedCount,
      };
      promotedTotal += promoted.modifiedCount;
      pendingReviewTotal += pendingReview.modifiedCount;
    }
    return {
      promoted: promotedTotal,
      pendingReview: pendingReviewTotal,
      byEducationLevel,
    };
  }

  async reviewStudentCompletion(
    id: string,
    decision: "graduated" | "retained" | "extended" | "transferred",
    notes: string | undefined,
    reviewedBy: Types.ObjectId,
  ): Promise<{ before: IPatient; after: IPatient }> {
    const before = await Patient.findById(id);
    if (!before) throw new AppError("Patient not found", 404);
    if (before.patientType !== "student" || before.enrollmentStatus !== "completion_pending") {
      throw new AppError("Student is not awaiting completion review", 409);
    }

    const finalStatus = decision === "retained"
      ? "active"
      : decision;
    const after = await Patient.findOneAndUpdate(
      { _id: id, patientType: "student", enrollmentStatus: "completion_pending" },
      {
        $set: {
          enrollmentStatus: finalStatus,
          isActive: decision !== "graduated" && decision !== "transferred",
          completionReviewDecision: decision,
          completionReviewNotes: notes?.trim() ?? "",
          completionReviewedAt: new Date(),
          completionReviewedBy: reviewedBy,
          updatedBy: reviewedBy,
        },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!after) throw new AppError("Student completion review was already resolved", 409);

    return { before, after };
  }
}
