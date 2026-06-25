import express from "express";
import { login } from "../controllers/auth.controller";
import { validateBody } from "../middleware/validate.middleware";
import { loginSchema } from "../validators/schemas";
import { loginLimiter } from "../middleware/rateLimit.middleware";

const router = express.Router();

// login user
// NOTE: there is no /register route anymore.
// Accounts can only be created by an admin via POST /api/users.
router.post("/login", loginLimiter, validateBody(loginSchema), login);

export default router;