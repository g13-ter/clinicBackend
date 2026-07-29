import type { UserRole } from "../types/roles";

/**
 * Single source of truth for RBAC capabilities.
 * Route files should mirror these lists in their `allowRoles(...)` calls.
 */
export const PERMISSIONS = {
  patients: {
    create: ["staff", "nurse"] as const satisfies readonly UserRole[],
    listFull: ["staff", "doctor", "nurse", "admin"] as const satisfies readonly UserRole[],
    listBasic: ["staff"] as const satisfies readonly UserRole[],
    viewById: ["staff", "doctor", "nurse"] as const satisfies readonly UserRole[],
    update: ["staff", "nurse"] as const satisfies readonly UserRole[],
    archive: ["admin"] as const satisfies readonly UserRole[],
  },
  appointments: {
    create: ["staff", "nurse", "doctor"] as const satisfies readonly UserRole[],
    list: ["staff", "nurse", "doctor", "admin"] as const satisfies readonly UserRole[],
    viewById: ["staff", "nurse", "doctor"] as const satisfies readonly UserRole[],
    update: ["staff", "nurse"] as const satisfies readonly UserRole[],
  },
  medicines: {
    create: ["nurse"] as const satisfies readonly UserRole[],
    list: ["nurse", "doctor", "admin"] as const satisfies readonly UserRole[],
    lowStock: ["nurse", "doctor", "admin"] as const satisfies readonly UserRole[],
    update: ["nurse"] as const satisfies readonly UserRole[],
    delete: ["nurse"] as const satisfies readonly UserRole[],
  },
  purchaseRequests: {
    // Nurse submits a restock request when stock is low/out; admin reviews it.
    create: ["nurse"] as const satisfies readonly UserRole[],
    list: ["nurse", "admin"] as const satisfies readonly UserRole[],
    viewById: ["nurse", "admin"] as const satisfies readonly UserRole[],
    review: ["admin"] as const satisfies readonly UserRole[],
  },
  visits: {
    create: ["staff", "nurse"] as const satisfies readonly UserRole[],
    list: ["staff", "doctor", "nurse", "admin"] as const satisfies readonly UserRole[],
    todayCount: ["doctor", "nurse", "admin"] as const satisfies readonly UserRole[],
    viewById: ["doctor", "nurse"] as const satisfies readonly UserRole[],
    update: ["nurse", "doctor"] as const satisfies readonly UserRole[],
    recordVitals: ["nurse"] as const satisfies readonly UserRole[],
    recordConsultation: ["doctor"] as const satisfies readonly UserRole[],
    archive: ["admin"] as const satisfies readonly UserRole[],
  },
  medicalHistory: {
    create: ["doctor"] as const satisfies readonly UserRole[],
    list: ["doctor", "nurse"] as const satisfies readonly UserRole[],
    viewById: ["doctor", "nurse"] as const satisfies readonly UserRole[],
    update: ["doctor"] as const satisfies readonly UserRole[],
    delete: ["doctor"] as const satisfies readonly UserRole[],
    generateCertificate: ["doctor"] as const satisfies readonly UserRole[],
  },
  users: {
    manage: ["admin"] as const satisfies readonly UserRole[],
    listDoctors: ["staff", "nurse", "doctor", "admin"] as const satisfies readonly UserRole[],
  },
  auditLogs: {
    view: ["admin"] as const satisfies readonly UserRole[],
  },
  reports: {
    generate: ["admin", "nurse"] as const satisfies readonly UserRole[],
  },
  dashboard: {
    view: ["admin", "doctor", "nurse", "staff"] as const satisfies readonly UserRole[],
  },
  systemSettings: {
    manage: ["admin"] as const satisfies readonly UserRole[],
  },
} as const;

export const roleHasPermission = (
  role: UserRole,
  allowed: readonly UserRole[]
): boolean => allowed.includes(role); 
