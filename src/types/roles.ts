/** Canonical role list — keep in sync with User schema enum and JWT payload validation. */
export const USER_ROLES = ["superadmin", "admin", "doctor", "nurse", "staff"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
