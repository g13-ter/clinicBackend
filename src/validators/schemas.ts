import { z } from "zod";


// ===== AUTH =====

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Must be a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["admin", "doctor", "nurse", "staff"], {
    message: "Role must be admin, doctor, nurse, or staff"
  })
});

export const loginSchema = z.object({
  email: z.string().email("Must be a valid email"),
  password: z.string().min(1, "Password is required")
});


// ===== USER =====

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
    role: z.enum(["admin", "doctor", "nurse", "staff"]).optional(),
    // Deactivation uses DELETE so it can enforce self/last-admin safeguards.
    // PUT may only reactivate an existing account.
    isActive: z.literal(true).optional(),
  isAvailable: z.boolean().optional(),
  scheduleNotes: z.string().optional()
});


// ===== PATIENT =====

export const createPatientSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  age: z.number().int().min(1).max(100, "Age must be realistic"),
  gender: z.enum(["Male", "Female"]),
  course: z.string().min(1),
  yearLevel: z.number().int().min(1).max(10),
  contactNumber: z.string().min(7, "Contact number looks too short"),
  email: z.string().email("Must be a valid email").optional(),
  address: z.string().min(1),
  dateOfBirth: z.coerce.date().optional(),
  bloodType: z.string().max(10).optional(),
  guardianName: z.string().min(1).optional(),
  guardianContactNumber: z.string().min(7).optional(),
  healthConditions: z.string().optional(),
  medicalAlerts: z.object({
    allergies: z.array(z.string().min(1)).optional(),
    chronicConditions: z.array(z.string().min(1)).optional(),
    currentMedications: z.array(z.string().min(1)).optional(),
    notes: z.string().optional(),
  }).optional(),
  consents: z.object({
    treatment: z.boolean(),
    medicineAdministration: z.boolean(),
    dataPrivacy: z.boolean(),
    guardianName: z.string().optional(),
    updatedAt: z.coerce.date().optional(),
  }).optional(),
  schoolYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
  enrollmentStatus: z.enum(["active", "graduated", "transferred"]).optional(),
  immunizations: z.array(z.object({
    vaccine: z.string().min(1),
    dateAdministered: z.coerce.date().optional(),
    notes: z.string().optional(),
  })).optional(),
});

export const updatePatientSchema = createPatientSchema.partial();

export const advanceSchoolYearSchema = z.object({
  schoolYear: z.string().regex(/^\d{4}-\d{4}$/, "School year must use YYYY-YYYY"),
  graduatingYearLevel: z.number().int().min(1).max(10).default(4),
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

export const createVisitSchema = z.object({
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

export const updateVisitSchema = createVisitSchema.partial().omit({
  patientId: true
});

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
});

export const createMedicalHistorySchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  visitId: z.string().optional(),
  diagnosis: z.string().optional(),
  prescription: z.string().optional(),
  prescribedItems: z.array(prescribedItemSchema).optional(),
  labRequest: z.string().optional(),
  familyHistory: z.string().optional(),
  allergies: z.string().optional()
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


// ===== MEDICINE =====

export const createMedicineSchema = z.object({
  name: z.string().min(1, "Medicine name is required"),
  category: z.string().optional(),
  quantity: z.number().int().min(0, "Quantity cannot be negative"),
  unit: z.string().min(1, "Unit is required"),
  expiryDate: z.coerce.date().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  supplier: z.string().optional(),
  dateReceived: z.coerce.date().optional()
});

export const updateMedicineSchema = createMedicineSchema.partial();

export const createInventoryBatchSchema = z.object({
  batchNumber: z.string().min(1, "Batch number is required"),
  quantityReceived: z.number().int().min(1, "Quantity received must be at least 1"),
  expiryDate: z.coerce.date().optional(),
  supplier: z.string().optional(),
  receivedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});


// ===== PURCHASE REQUEST =====

export const createPurchaseRequestSchema = z.object({
  medicineId: z.string().min(1).optional(),
  itemName: z.string().min(1, "Medicine name is required").optional(),
  unit: z.string().min(1, "Unit is required").optional(),
  category: z.string().optional(),
  quantityRequested: z.number().int().min(1, "Quantity must be at least 1"),
  reason: z.string().min(1, "Reason is required"),
}).superRefine((value, ctx) => {
  if (!value.medicineId && !value.itemName) {
    ctx.addIssue({ code: "custom", message: "Select an inventory item or enter a new medicine name", path: ["itemName"] });
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
  expiryDate: z.coerce.date().optional(),
  supplier: z.string().optional(),
});


// ===== SYSTEM SETTINGS =====

const timeSchema = z.string().regex(
  /^([01]\d|2[0-3]):[0-5]\d$/,
  "Time must use the 24-hour HH:mm format",
);

export const updateSystemSettingsSchema = z.object({
  schoolYear: z.string().regex(/^\d{4}-\d{4}$/, "School year must use YYYY-YYYY"),
  clinicOpenTime: timeSchema,
  clinicCloseTime: timeSchema,
  emailNotificationsEnabled: z.boolean(),
  appointmentRemindersEnabled: z.boolean(),
  stockAlertsEnabled: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.clinicCloseTime <= value.clinicOpenTime) {
    ctx.addIssue({
      code: "custom",
      message: "Closing time must be later than opening time",
      path: ["clinicCloseTime"],
    });
  }
});
