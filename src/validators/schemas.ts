import { z } from "zod";
import { USER_ROLES } from "../types/roles";


// ===== AUTH =====

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Must be a valid email"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  role: z.enum(USER_ROLES, {
    message: "Role must be superadmin, admin, doctor, nurse, or staff"
  }),
  actorPassword: z.string().min(1, "Your current password is required").max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Must be a valid email"),
  password: z.string().min(1, "Password is required")
});


// ===== USER =====

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(12, "Password must be at least 12 characters").optional(),
  role: z.enum(USER_ROLES).optional(),
  // Deactivation uses DELETE so it can enforce self/last-admin safeguards.
  // PUT may only reactivate an existing account.
  isActive: z.literal(true).optional(),
  isAvailable: z.boolean().optional(),
  scheduleNotes: z.string().optional(),
  actorPassword: z.string().min(1, "Your current password is required").max(200).optional(),
});

export const privilegedActionSchema = z.object({
  actorPassword: z.string().min(1, "Your current password is required").max(200).optional(),
});


// ===== PATIENT =====

const contactNumberSchema = z.string()
  .min(7, "Contact number must contain at least 7 digits")
  .max(15, "Contact number must contain at most 15 digits")
  .regex(/^\d+$/, "Contact number must contain numbers only");

const patientPayloadSchema = z.object({
  patientType: z.enum(["student", "teacher", "staff"]).default("student"),
  educationLevel: z.enum(["elementary", "junior_high", "senior_high", "college"]).optional(),
  studentId: z.string().min(1).optional(),
  employeeId: z.string().min(1).optional(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  age: z.number().int().min(1).max(100, "Age must be realistic"),
  gender: z.enum(["Male", "Female"]),
  course: z.string().min(1).optional(),
  yearLevel: z.number().int().min(1).max(12).optional(),
  programDurationYears: z.number().int().min(1).max(10).optional(),
  department: z.string().trim().min(1).max(200).optional(),
  position: z.string().trim().min(1).max(200).optional(),
  contactNumber: contactNumberSchema,
  email: z.string().email("Must be a valid email").optional(),
  address: z.string().min(1),
  dateOfBirth: z.coerce.date().optional(),
  bloodType: z.string().max(10).optional(),
  guardianName: z.string().min(1).optional(),
  guardianContactNumber: contactNumberSchema.optional(),
  emergencyContactName: z.string().trim().min(1).max(200).optional(),
  emergencyContactNumber: contactNumberSchema.optional(),
  healthConditions: z.string().optional(),
  medicalAlerts: z.object({
    allergies: z.array(z.string().min(1)).optional(),
    chronicConditions: z.array(z.string().min(1)).optional(),
    currentMedications: z.array(z.string().min(1)).optional(),
    notes: z.string().optional(),
  }).optional(),
  immunizations: z.array(z.object({
    vaccine: z.string().min(1),
    dateAdministered: z.coerce.date().optional(),
    notes: z.string().optional(),
  })).optional(),
});

export const createPatientSchema = patientPayloadSchema.superRefine((value, ctx) => {
  if (value.patientType === "student") {
    const educationLevel = value.educationLevel ?? "college";
    if (!value.studentId) ctx.addIssue({ code: "custom", path: ["studentId"], message: "Student ID is required" });
    if (!value.yearLevel) ctx.addIssue({ code: "custom", path: ["yearLevel"], message: "Year level is required" });
    if (educationLevel === "college" && !value.course) {
      ctx.addIssue({ code: "custom", path: ["course"], message: "Course is required for college students" });
    }
    if (educationLevel === "college" && value.yearLevel && value.yearLevel > (value.programDurationYears ?? 4)) {
      ctx.addIssue({ code: "custom", path: ["yearLevel"], message: "College year cannot exceed the program length" });
    }
    const gradeRange = educationLevel === "elementary"
      ? { min: 1, max: 6, label: "Elementary grade" }
      : educationLevel === "junior_high"
        ? { min: 7, max: 10, label: "Junior High grade" }
        : educationLevel === "senior_high"
          ? { min: 11, max: 12, label: "Senior High grade" }
          : null;
    if (gradeRange && value.yearLevel && (value.yearLevel < gradeRange.min || value.yearLevel > gradeRange.max)) {
      ctx.addIssue({ code: "custom", path: ["yearLevel"], message: `${gradeRange.label} must be between ${gradeRange.min} and ${gradeRange.max}` });
    }
  } else {
    if (!value.employeeId) ctx.addIssue({ code: "custom", path: ["employeeId"], message: "Employee ID is required" });
    if (!value.department) ctx.addIssue({ code: "custom", path: ["department"], message: "Department is required" });
    if (!value.position) ctx.addIssue({ code: "custom", path: ["position"], message: "Position is required" });
    if (!value.emergencyContactName) ctx.addIssue({ code: "custom", path: ["emergencyContactName"], message: "Emergency contact name is required" });
    if (!value.emergencyContactNumber) ctx.addIssue({ code: "custom", path: ["emergencyContactNumber"], message: "Emergency contact number is required" });
  }
});

export const updatePatientSchema = patientPayloadSchema.partial();

export const updateClinicalProfileSchema = z.object({
  familyHistory: z.string().max(2000).optional(),
  pastMedicalHistory: z.string().max(4000).optional(),
  allergies: z.array(z.string().trim().min(1).max(200)).max(50),
  currentMedications: z.array(z.string().trim().min(1).max(200)).max(50),
  chronicConditions: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  notes: z.string().max(2000).optional(),
  verified: z.boolean().optional(),
});

export const updateOwnProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(12, "New password must be at least 12 characters").optional(),
}).refine((value) => value.name !== undefined || value.email !== undefined || value.newPassword !== undefined, {
  message: "Provide at least one profile change",
});

export const advanceSchoolYearSchema = z.object({
  schoolYear: z.string().regex(/^\d{4}-\d{4}$/, "School year must use YYYY-YYYY"),
});

export const reviewStudentCompletionSchema = z.object({
  decision: z.enum(["graduated", "retained", "extended", "transferred"]),
  notes: z.string().trim().max(2000, "Review notes must not exceed 2000 characters").optional(),
});


// ===== CLINIC VISIT =====

const bloodPressureSchema = z
  .string()
  .trim()
  .regex(/^\d{2,3}\/\d{2,3}$/, "Blood pressure must use systolic/diastolic, for example 120/80")
  .refine((value) => {
    const [systolic = 0, diastolic = 0] = value.split("/").map(Number);
    return systolic >= 60 && systolic <= 250 &&
      diastolic >= 40 && diastolic <= 150 &&
      systolic > diastolic;
  }, "Blood pressure is outside the supported clinical range");

const visitSchemaBase = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  complaint: z.string().min(1, "Complaint is required"),
  treatment: z.string().optional(),
  notes: z.string().optional(),
  bloodPressure: bloodPressureSchema.optional(),
  temperature: z.number().min(30, "Temperature must be at least 30°C").max(45, "Temperature must not exceed 45°C").optional(),
  pulseRate: z.number().int().min(30, "Pulse rate must be at least 30 bpm").max(250, "Pulse rate must not exceed 250 bpm").optional(),
  respiratoryRate: z.number().int().min(5, "Respiratory rate must be at least 5").max(80, "Respiratory rate must not exceed 80").optional(),
  heightCm: z.number().min(30, "Height must be at least 30 cm").max(250, "Height must not exceed 250 cm").optional(),
  weightKg: z.number().min(1, "Weight must be at least 1 kg").max(500, "Weight must not exceed 500 kg").optional(),
  nursingAssessment: z.string().optional(),
  consultationFindings: z.string().optional(),
  nursingInterventions: z.string().optional(),
  nursingRecommendations: z.string().optional(),
  clinicProtocolReference: z.string().optional(),
  isEmergency: z.boolean().optional(),
  emergencyDetails: z.string().optional(),
});

const requireEmergencyDetails = (
  value: {
    isEmergency?: boolean | undefined;
    emergencyDetails?: string | undefined;
  },
  context: z.RefinementCtx,
) => {
  if (value.isEmergency && !value.emergencyDetails?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["emergencyDetails"],
      message: "Emergency details are required when care proceeds under the emergency exception",
    });
  }
};

export const createVisitSchema = visitSchemaBase.superRefine(requireEmergencyDetails);

export const updateVisitSchema = visitSchemaBase
  .omit({ patientId: true })
  .partial()
  .superRefine(requireEmergencyDetails);

export const updateVisitStatusSchema = z.object({
  status: z.enum(["triage", "ready_for_doctor", "in_consultation", "paused", "completed", "cancelled", "referred"]),
  referralFacility: z.string().min(1).optional(),
  referralReason: z.string().min(1).optional(),
  referralOutcome: z.string().optional(),
  guardianNotifiedAt: z.coerce.date().optional(),
  closureOutcome: z.enum(["returned_to_class", "sent_home", "guardian_pickup", "referred", "cancelled", "physician_consultation"]).optional(),
}).superRefine((value, ctx) => {
  if (value.status === "referred" && (!value.referralFacility || !value.referralReason)) {
    ctx.addIssue({ code: "custom", message: "Referral facility and reason are required", path: ["referralFacility"] });
  }
  if ((value.status === "completed" || value.status === "cancelled") && !value.closureOutcome) {
    ctx.addIssue({ code: "custom", message: "A closure outcome is required", path: ["closureOutcome"] });
  }
});


// ===== MEDICAL HISTORY =====

export const prescribedItemSchema = z.object({
  medicineId: z.string().min(1, "Medicine ID is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  instructions: z.string().optional(),
  route: z.string().trim().min(1, "Administration route is required").optional(),
  scheduledTime: z.string().trim().min(1, "Administration time or frequency is required").optional(),
});

export const dispenseMedicationSchema = z.object({
  confirmedIdentity: z.literal(true, { error: "Confirm the student's identity" }),
  confirmedMedication: z.literal(true, { error: "Confirm the medication and dose" }),
  confirmedAllergies: z.literal(true, { error: "Confirm allergies and medical alerts" }),
  confirmedRouteTime: z.literal(true, { error: "Confirm the route and administration time" }),
  administrationNotes: z.string().trim().max(1000).optional(),
});

export const notGivenMedicationSchema = z.object({
  reason: z.enum([
    "student_refused",
    "allergy_concern",
    "insufficient_stock",
    "clarification_required",
    "doctor_cancelled",
    "other",
  ]),
  notes: z.string().trim().min(3, "Please explain why the medication was not given").max(1000),
});

export const adverseReactionSchema = z.object({
  details: z.string().trim().min(3, "Describe the observed reaction").max(2000),
});

export const createMedicalHistorySchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  visitId: z.string().optional(),
  diagnosis: z.string().optional(),
  prescription: z.string().optional(),
  prescribedItems: z.array(prescribedItemSchema).optional(),
  labRequest: z.string().optional(),
  familyHistory: z.string().optional(),
  allergies: z.string().optional(),
  closureOutcome: z.enum(["returned_to_class", "sent_home", "guardian_pickup"]).optional(),
});

// Prescriptions are immutable after creation to keep inventory in sync.
export const updateMedicalHistorySchema = createMedicalHistorySchema.partial().omit({
  patientId: true,
  prescribedItems: true
});


// ===== APPOINTMENT =====

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  doctorId: z.string().optional(),
  appointmentDate: z.coerce.date({
    message: "Appointment date must be a valid date"
  }),
  reason: z.string().min(1, "Reason is required"),
  notes: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  type: z.enum(["regular", "follow_up"]).optional(),
  sourceVisitId: z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  doctorId: z.string().optional(),
  appointmentDate: z.coerce.date().optional(),
  reason: z.string().min(1).optional(),
  // Staff/nurse may reschedule or cancel. Confirmation, check-in, and
  // completion use dedicated role-owned endpoints.
  status: z.enum(["pending", "cancelled"]).optional(),
  cancellationReason: z.string().trim().min(3).max(500).optional(),
  notes: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  type: z.enum(["regular", "follow_up"]).optional(),
  sourceVisitId: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.status === "cancelled" && !value.cancellationReason) {
    ctx.addIssue({
      code: "custom",
      message: "Please provide a reason for cancelling the appointment",
      path: ["cancellationReason"],
    });
  }
});

export const declineAppointmentSchema = z.object({
  reason: z.string().trim().min(3, "Please provide a reason for declining").max(500),
});


// ===== MEDICINE =====

export const createMedicineSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  category: z.string().optional(),
  inventorySection: z.string().trim().max(80).optional(),
  quantity: z.number().int().min(0, "Quantity cannot be negative"),
  unit: z.string().min(1, "Unit is required"),
  expiryDate: z.coerce.date().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  supplier: z.string().optional(),
  dateReceived: z.coerce.date().optional(),
  batchNumber: z.string().trim().min(1, "Batch number is required").optional(),
  }).superRefine((value, context) => {
    if (value.quantity > 0 && !value.batchNumber) {
      context.addIssue({ code: "custom", path: ["batchNumber"], message: "Batch number is required for initial stock" });
    }
    if (value.quantity > 0 && !value.expiryDate) {
      context.addIssue({ code: "custom", path: ["expiryDate"], message: "Expiry date is required for initial stock" });
    }
  });
  
export const updateMedicineSchema = z.object({
  name: z.string().min(1, "Item name is required").optional(),
  category: z.string().optional(),
  inventorySection: z.string().trim().max(80).optional(),
  unit: z.string().min(1, "Unit is required").optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  supplier: z.string().optional(),
});

export const createInventoryBatchSchema = z.object({
  batchNumber: z.string().min(1, "Batch number is required"),
  quantityReceived: z.number().int().min(1, "Quantity received must be at least 1"),
    expiryDate: z.coerce.date({ error: "Expiry date is required" }),
  supplier: z.string().optional(),
  receivedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export const monthlyInventoryPeriodSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(9999),
});

export const monthlyInventoryDraftSchema = z.object({
  items: z.array(z.object({
    medicineId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid medicine ID"),
    physicalCount: z.number().int().min(0),
    varianceNotes: z.string().trim().max(1000).optional(),
  })),
});

export const createInventoryLabelSchema = z.object({
  name: z.string().trim().min(1, "Label name is required").max(80),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid label color").optional(),
});

export const updateInventoryLabelSchema = createInventoryLabelSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one label field is required",
);

export const reorderInventoryLabelsSchema = z.object({
  labelIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).min(1),
});

export const assignInventoryLabelSchema = z.object({
  medicineIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).min(1, "Select at least one inventory item"),
});

export const mergeInventoryLabelsSchema = z.object({
  targetLabelId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Choose a target label"),
});


// ===== PURCHASE REQUEST =====

export const createPurchaseRequestSchema = z.object({
  medicineId: z.string().min(1).optional(),
  itemName: z.string().min(1, "Item name is required").optional(),
  unit: z.string().min(1, "Unit is required").optional(),
  category: z.string().optional(),
  inventorySection: z.string().trim().max(80).optional(),
  quantityRequested: z.number().int().min(1, "Quantity must be at least 1"),
  reason: z.string().min(1, "Reason is required"),
}).superRefine((value, ctx) => {
  if (!value.medicineId && !value.itemName) {
    ctx.addIssue({ code: "custom", message: "Select an inventory item or enter a new item name", path: ["itemName"] });
  }
  if (!value.medicineId && !value.unit) {
    ctx.addIssue({ code: "custom", message: "Unit is required for a new medicine", path: ["unit"] });
  }
});

export const reviewPurchaseRequestSchema = z.object({
  status: z.enum(["approved", "rejected"], {
    message: "Status must be either approved or rejected",
  }),
  reviewNotes: z.string().optional(),
});

export const orderPurchaseRequestSchema = z.object({
  supplier: z.string().optional(),
  estimatedCost: z.number().min(0).optional(),
});

export const cancelPurchaseRequestSchema = z.object({
  reviewNotes: z.string().max(500).optional(),
});

export const receivePurchaseRequestSchema = z.object({
  batchNumber: z.string().min(1),
  quantityReceived: z.number().int().min(1),
  expiryDate: z.coerce.date({ error: "Expiry date is required" }),
  supplier: z.string().optional(),
});


// ===== SYSTEM SETTINGS =====

const timeSchema = z.string().regex(
  /^([01]\d|2[0-3]):[0-5]\d$/,
  "Time must use the 24-hour HH:mm format",
);

const clinicScheduleDaySchema = z.object({
  day: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]),
  openTime: timeSchema,
  closeTime: timeSchema,
});

const clinicProfileFields = {
  clinicName: z.string().trim().min(2).max(100),
  buildingLocation: z.string().trim().min(2).max(120),
  floorRoom: z.string().trim().min(2).max(120),
  operatingDays: z.string().trim().min(2).max(100),
  clinicOpenTime: timeSchema,
  clinicCloseTime: timeSchema,
  weeklySchedule: z.array(clinicScheduleDaySchema).min(1).max(7).optional(),
  phoneNumber: z.string().trim().min(5).max(40),
  emailAddress: z.string().trim().email().max(160),
};

const validateOperatingHours = (
  value: { clinicOpenTime: string; clinicCloseTime: string; weeklySchedule?: Array<{ day: string; openTime: string; closeTime: string }> | undefined },
  ctx: z.RefinementCtx,
) => {
  if (value.clinicCloseTime <= value.clinicOpenTime) {
    ctx.addIssue({
      code: "custom",
      message: "Closing time must be later than opening time",
      path: ["clinicCloseTime"],
    });
  }
  const days = new Set<string>();
  value.weeklySchedule?.forEach((entry, index) => {
    if (days.has(entry.day)) {
      ctx.addIssue({ code: "custom", message: "Each operating day can only appear once", path: ["weeklySchedule", index, "day"] });
    }
    days.add(entry.day);
    if (entry.closeTime <= entry.openTime) {
      ctx.addIssue({ code: "custom", message: "Closing time must be later than opening time", path: ["weeklySchedule", index, "closeTime"] });
    }
  });
};

export const updateSystemSettingsSchema = z.object({
  schoolYear: z.string().regex(/^\d{4}-\d{4}$/, "School year must use YYYY-YYYY"),
  clinicName: clinicProfileFields.clinicName.optional(),
  buildingLocation: clinicProfileFields.buildingLocation.optional(),
  floorRoom: clinicProfileFields.floorRoom.optional(),
  operatingDays: clinicProfileFields.operatingDays.optional(),
  clinicOpenTime: clinicProfileFields.clinicOpenTime,
  clinicCloseTime: clinicProfileFields.clinicCloseTime,
  weeklySchedule: clinicProfileFields.weeklySchedule,
  phoneNumber: clinicProfileFields.phoneNumber.optional(),
  emailAddress: clinicProfileFields.emailAddress.optional(),
  emailNotificationsEnabled: z.boolean(),
  appointmentRemindersEnabled: z.boolean(),
  stockAlertsEnabled: z.boolean(),
}).superRefine(validateOperatingHours);

export const clinicProfileSchema = z.object(clinicProfileFields).strict().superRefine(validateOperatingHours);
