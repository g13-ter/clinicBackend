import { Request, Response, NextFunction } from "express";
import { ClinicVisitService } from "../services/clinicVisit.service";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination";
import { logAudit } from "../utils/auditLog";
import { getAuthenticatedUser, getAuthenticatedObjectId } from "../utils/authUser";
import { AppError } from "../middleware/error.middleware";
import { buildReferralDocx } from "../utils/referralDocx";

const clinicVisitService = new ClinicVisitService();

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
    const isStaff = getAuthenticatedUser(req).role === "staff";
    const data = isStaff
      ? queue.map((visit) => ({
          _id: visit._id,
          patientId: visit.patientId,
          appointmentId: visit.appointmentId,
          assignedDoctorId: visit.assignedDoctorId,
          visitDate: visit.visitDate,
          status: visit.status,
          isActive: visit.isActive,
        }))
      : queue;
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

    res.status(200).json({ success: true, message: "Student marked ready for consultation", data: after });
  } catch (error) {
    next(error);
  }
};

export const updateVisitStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = getAuthenticatedUser(req).id;
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
    const userId = getAuthenticatedUser(req).id;
    const { patientId, ...visitData } = req.body;
    if (visitData.heightCm && visitData.weightKg) {
      visitData.bmi = Number((visitData.weightKg / Math.pow(visitData.heightCm / 100, 2)).toFixed(1));
    }

    const visit = await clinicVisitService.createVisit({
      patientId,
      ...visitData,
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
    const userId = getAuthenticatedUser(req).id;
    const visitData = { ...req.body };
    if (visitData.heightCm && visitData.weightKg) {
      visitData.bmi = Number((visitData.weightKg / Math.pow(visitData.heightCm / 100, 2)).toFixed(1));
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
