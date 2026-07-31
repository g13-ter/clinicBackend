import { z } from "zod";
import { USER_ROLES } from "./roles";

/** Shape embedded in JWT access tokens after login. */
export const jwtPayloadSchema = z.object({
  id: z.string().min(1),
  role: z.enum(USER_ROLES),
  sv: z.number().int().nonnegative(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type AuthUser = z.infer<typeof jwtPayloadSchema>;
