import express from "express";
import { login } from "../controllers/auth.controller";
import { validateBody } from "../middleware/validate.middleware";
import { loginSchema } from "../validators/schemas";
import { loginIpLimiter, loginLimiter } from "../middleware/rateLimit.middleware";

const router = express.Router();

// Login only; admins create accounts through /api/users.
router.post("/login", loginIpLimiter, loginLimiter, validateBody(loginSchema), login);

export default router;
