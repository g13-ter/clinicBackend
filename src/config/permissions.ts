import type { UserRole } from "../types/roles";

/**
 * Single source of truth for RBAC capabilities.
 * Route files should mirror these lists in their `allowRoles(...)` calls.
 */
export const PERMISSIONS = {
  patients: {
    create: ["nurse"] as const satisfies readonly UserRole[],
    listFull: ["doctor", "nurse", "admin"] as const satisfies readonly UserRole[],
    listBasic: ["staff"] as const satisfies readonly UserRole[],
    viewById: ["doctor", "nurse"] as const satisfies readonly UserRole[],
    update: ["nurse"] as const satisfies readonly UserRole[],
    archive: ["admin"] as const satisfies readonly UserRole[],
  },
  appointments: {
    create: ["staff", "nurse"] as const satisfies readonly UserRole[],
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
  visits: {
    create: ["nurse"] as const satisfies readonly UserRole[],
    list: ["doctor", "nurse", "admin"] as const satisfies readonly UserRole[],
    todayCount: ["doctor", "nurse", "admin"] as const satisfies readonly UserRole[],
    viewById: ["doctor", "nurse"] as const satisfies readonly UserRole[],
    update: ["nurse"] as const satisfies readonly UserRole[],
    archive: ["nurse"] as const satisfies readonly UserRole[],
  },
  medicalHistory: {
    create: ["doctor"] as const satisfies readonly UserRole[],
    list: ["doctor", "nurse"] as const satisfies readonly UserRole[],
    viewById: ["doctor", "nurse"] as const satisfies readonly UserRole[],
    update: ["doctor"] as const satisfies readonly UserRole[],
    delete: ["doctor"] as const satisfies readonly UserRole[],
  },
  users: {
    manage: ["admin"] as const satisfies readonly UserRole[],
  },
  auditLogs: {
    view: ["admin"] as const satisfies readonly UserRole[],
  },
  reports: {
    generate: ["admin"] as const satisfies readonly UserRole[],
  },
} as const;

export const roleHasPermission = (
  role: UserRole,
  allowed: readonly UserRole[]
): boolean => allowed.includes(role);