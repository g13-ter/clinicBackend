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
  address: z.string().min(1)
});

export const updatePatientSchema = createPatientSchema.partial();


// ===== CLINIC VISIT =====

export const createVisitSchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  complaint: z.string().min(1, "Complaint is required"),
  treatment: z.string().optional(),
  notes: z.string().optional(),
  bloodPressure: z.string().optional(),
  temperature: z.number().optional(),
  pulseRate: z.number().optional()
});

export const updateVisitSchema = createVisitSchema.partial().omit({
  patientId: true
});


// ===== MEDICAL HISTORY =====

export const createMedicalHistorySchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  diagnosis: z.string().optional(),
  prescription: z.string().optional(),
  labRequest: z.string().optional(),
  familyHistory: z.string().optional(),
  allergies: z.string().optional()
});

export const updateMedicalHistorySchema = createMedicalHistorySchema.partial().omit({
  patientId: true
});


// ===== APPOINTMENT =====

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  doctorId: z.string().optional(),
  appointmentDate: z.coerce.date({
    message: "Appointment date must be a valid date"
  }),
  reason: z.string().min(1, "Reason is required"),
  notes: z.string().optional()
});

export const updateAppointmentSchema = z.object({
  doctorId: z.string().optional(),
  appointmentDate: z.coerce.date().optional(),
  reason: z.string().min(1).optional(),
  status: z.enum(["pending", "confirmed", "cancelled", "completed"]).optional(),
  notes: z.string().optional()
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


// ===== PURCHASE REQUEST =====

export const createPurchaseRequestSchema = z.object({
  medicineId: z.string().min(1, "Medicine ID is required"),
  quantityRequested: z.number().int().min(1, "Quantity must be at least 1"),
  reason: z.string().min(1, "Reason is required"),
});

export const reviewPurchaseRequestSchema = z.object({
  status: z.enum(["approved", "rejected"], {
    message: "Status must be either approved or rejected",
  }),
  reviewNotes: z.string().optional(),
});