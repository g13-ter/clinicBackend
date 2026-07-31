import { Request, Response, NextFunction } from "express";
import { ClinicVisitService } from "../services/clinicVisit.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { AppError } from "../middleware/error.middleware";
import { buildReferralDocx } from "../utils/referralDocx";

const clinicVisitService = new ClinicVisitService();

const visitFieldsByRole = {
  staff: ["complaint", "isEmergency", "emergencyDetails"],
  nurse: [
    "complaint",
    "treatment",
    "notes",
    "bloodPressure",
    "temperature",
    "pulseRate",
    "respiratoryRate",
    "heightCm",
    "weightKg",
    "nursingAssessment",
    "nursingInterventions",
    "nursingRecommendations",
    "clinicProtocolReference",
    "isEmergency",
    "emergencyDetails",
  ],
  doctor: [
    "complaint",
    "treatment",
    "notes",
    "consultationFindings",
    "isEmergency",
    "emergencyDetails",
  ],
} as const;

const restrictVisitFields = (
  role: "staff" | "nurse" | "doctor",
  data: Record<string, unknown>,
): Record<string, unknown> => {
  const allowed = new Set<string>(visitFieldsByRole[role]);
  const prohibited = Object.keys(data).filter(
    (field) => data[field] !== undefined && !allowed.has(field),
  );

  if (prohibited.length > 0) {
    const vitalFields = new Set([
      "bloodPressure",
      "temperature",
      "pulseRate",
      "respiratoryRate",
      "heightCm",
      "weightKg",
      "bmi",
    ]);
    if (role === "doctor" && prohibited.some((field) => vitalFields.has(field))) {
      throw new AppError("Vital signs can only be recorded or updated by a nurse", 403);
    }
    if (role === "nurse" && prohibited.includes("consultationFindings")) {
      throw new AppError("Physician consultation findings can only be recorded by a doctor", 403);
    }
    throw new AppError(`Your role cannot update: ${prohibited.join(", ")}`, 403);
  }

  return Object.fromEntries(
    Object.entries(data).filter(([field]) => allowed.has(field)),
  );
};

// GET TODAY COUNT
export const getTodayVisitCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = await clinicVisitService.getTodayCount();
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
};

// GET QUEUE — clinic-wide list of currently open visits, not audit-logged
export const getQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const queue = await clinicVisitService.getQueue();
    const actor = getAuthenticatedUser(req);
    const isStaff = actor.role === "staff";
    const roleVisibleQueue = actor.role === "doctor"
      ? queue.filter((visit) => {
          const visibleStatus =
            visit.status === "ready_for_doctor" ||
            visit.status === "in_consultation" ||
            visit.status === "paused";
          if (!visibleStatus && !visit.isEmergency) return false;

          if (!visit.assignedDoctorId) return true;
          const assignedDoctor = visit.assignedDoctorId as unknown as {
            _id?: unknown;
          };
          return String(assignedDoctor._id ?? visit.assignedDoctorId) === actor.id;
        })
      : queue;
    const data = isStaff
      ? roleVisibleQueue.map((visit) => ({
          _id: visit._id,
          patientId: visit.patientId,
          appointmentId: visit.appointmentId,
          assignedDoctorId: visit.assignedDoctorId,
          visitDate: visit.visitDate,
          status: visit.status,
          isActive: visit.isActive,
        }))
      : roleVisibleQueue;
    res.status(200).json({ success: true, message: "Student queue retrieved successfully", data });
  } catch (error) {
    next(error);
  }
};

// MARK READY FOR DOCTOR — nurse signals triage/vitals are done
export const markReadyForDoctor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;
    const { before, after } = await clinicVisitService.markReadyForDoctor(id, userId);

    logAudit({
      action: "update",
      resource: "ClinicVisit",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Student marked ready for doctor", data: after });
  } catch (error) {
    next(error);
  }
};

export const updateVisitStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const userId = actor.id;
    if (actor.role === "doctor" && req.body.status === "in_consultation") {
      const visit = await clinicVisitService.getVisitById(id);
      if (!visit.readyForDoctor && !visit.isEmergency) {
        throw new AppError(
          "A nurse must record triage and mark the student ready before the doctor starts consultation",
          409,
        );
      }
      const assignedDoctor = visit.assignedDoctorId as unknown as { _id?: unknown } | undefined;
      if (assignedDoctor?._id && String(assignedDoctor._id) !== userId) {
        throw new AppError("This visit is assigned to another doctor", 403);
      }
    }
    const { before, after } = await clinicVisitService.updateStatus(id, req.body, userId);
    logAudit({ action: "update", resource: "ClinicVisit", resourceId: id, performedBy: userId, before: before.toObject(), after: after.toObject(), method: req.method, path: req.originalUrl });
    res.status(200).json({ success: true, message: "Visit status updated successfully", data: after });
  } catch (error) {
    next(error);
  }
};

// CREATE
export const createVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const actor = getAuthenticatedUser(req);
    const userId = actor.id;
    const { patientId, ...visitData } = req.body;
    if (actor.role === "admin") {
      throw new AppError("Administrators cannot create clinical visits", 403);
    }
    const permittedVisitData = restrictVisitFields(actor.role, visitData);
    if (permittedVisitData.heightCm && permittedVisitData.weightKg) {
      permittedVisitData.bmi = Number((
        Number(permittedVisitData.weightKg) /
        Math.pow(Number(permittedVisitData.heightCm) / 100, 2)
      ).toFixed(1));
    }

    const visit = await clinicVisitService.createVisit({
      patientId,
      ...permittedVisitData,
      recordedBy: getAuthenticatedObjectId(req),
    });

    logAudit({
      action: "create",
      resource: "ClinicVisit",
      resourceId: String(visit._id),
      performedBy: userId,
      after: visit.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(201).json({ success: true, message: "Clinic visit created successfully", data: visit });
  } catch (error) {
    next(error);
  }
};

// GET ALL BY PATIENT — read-only, not audit-logged
export const getVisitsByPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patientId = req.params.patientId as string;
    const search = req.query.search as string | undefined;
    const pagination = getPaginationParams(req.query);

    const { visits, total } = await clinicVisitService.getVisitsByPatient(patientId, pagination, search);

    res.status(200).json({
      success: true,
      message: "Clinic visits retrieved successfully",
      data: visits,
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    });
  } catch (error) {
    next(error);
  }
};

// GET BY ID — read-only, not audit-logged
export const getVisitById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const visit = await clinicVisitService.getVisitById(id);

    res.status(200).json({ success: true, message: "Clinic visit retrieved successfully", data: visit });
  } catch (error) {
    next(error);
  }
};

// UPDATE
export const updateVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = getAuthenticatedUser(req);
    const userId = actor.id;
    if (actor.role !== "nurse" && actor.role !== "doctor") {
      throw new AppError("Only nurses and doctors can update clinical visits", 403);
    }
    const visitData = restrictVisitFields(actor.role, { ...req.body });
    if (visitData.heightCm && visitData.weightKg) {
      visitData.bmi = Number((
        Number(visitData.weightKg) /
        Math.pow(Number(visitData.heightCm) / 100, 2)
      ).toFixed(1));
    }
    const { before, after } = await clinicVisitService.updateVisit(id, {
      ...visitData,
      updatedBy: getAuthenticatedObjectId(req),
    });

    logAudit({
      action: "update",
      resource: "ClinicVisit",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Clinic visit updated successfully", data: after });
  } catch (error) {
    next(error);
  }
};

// ARCHIVE (soft delete)
export const archiveVisit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;
    const { before, after } = await clinicVisitService.archiveVisit(id, userId);

    logAudit({
      action: "delete",
      resource: "ClinicVisit",
      resourceId: id,
      performedBy: userId,
      before: before.toObject(),
      after: after.toObject(),
      method: req.method,
      path: req.originalUrl,
    });

    res.status(200).json({ success: true, message: "Clinic visit archived successfully", data: after });
  } catch (error) {
    next(error);
  }
};

export const downloadReferralForm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const visit = await clinicVisitService.getVisitById(req.params.id as string);
    if (visit.status !== "referred" || !visit.referralFacility || !visit.referralReason) {
      throw new AppError("A referral form is available only after the visit is referred", 409);
    }
    const patient = visit.patientId as unknown as {
      firstName: string;
      lastName: string;
      studentId: string;
    };
    const provider = (visit.updatedBy ?? visit.recordedBy) as unknown as { name?: string };
    const vitals = [
      visit.temperature ? `${visit.temperature}°C` : "",
      visit.bloodPressure || "",
      visit.pulseRate ? `${visit.pulseRate} bpm` : "",
    ].filter(Boolean).join(" · ");
    const buffer = await buildReferralDocx({
      studentName: `${patient.firstName} ${patient.lastName}`,
      studentId: patient.studentId,
      visitDate: visit.visitDate,
      complaint: visit.complaint,
      vitals,
      ...(visit.emergencyDetails ? { emergencyDetails: visit.emergencyDetails } : {}),
      referralFacility: visit.referralFacility,
      referralReason: visit.referralReason,
      ...(visit.referralOutcome ? { referralOutcome: visit.referralOutcome } : {}),
      ...(visit.guardianNotifiedAt ? { guardianNotifiedAt: visit.guardianNotifiedAt } : {}),
      ...(provider?.name ? { providerName: provider.name } : {}),
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="Referral_${patient.studentId}_${visit._id}.docx"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};
