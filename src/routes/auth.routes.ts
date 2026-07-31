import express from "express";
import { login, logout, session } from "../controllers/auth.controller";
import { validateBody } from "../middleware/validate.middleware";
import { loginSchema } from "../validators/schemas";
import { loginIpLimiter, loginLimiter } from "../middleware/rateLimit.middleware";
import { protect } from "../middleware/auth.middleware";

const router = express.Router();

// Login only; admins create accounts through /api/users.
router.post("/login", loginIpLimiter, loginLimiter, validateBody(loginSchema), login);
router.post("/logout", logout);
router.get("/session", protect, session);

export default router;
