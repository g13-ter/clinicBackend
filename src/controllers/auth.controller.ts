import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { AppError } from "../middleware/error.middleware";
import type { CookieOptions } from "express";
import { SESSION_COOKIE_NAME } from "../utils/sessionToken";
import User from "../models/user.model";
import { CURRENT_TERMS_VERSION } from "../config/terms";

const authService = new AuthService();

const cookieOptions = (expiresAt?: string): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api",
  ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
});

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError("Email and password are required", 400);
    const result = await authService.login(email, password);
    res.cookie(SESSION_COOKIE_NAME, result.token, cookieOptions(result.expiresAt));
    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: result.user,
        expiresAt: result.expiresAt,
        requiresTermsAcceptance: !result.user.termsAccepted,
      },
      ...(process.env.NODE_ENV === "production" ? {} : { token: result.token }),
    });
  } catch (error) { next(error); }
};

export const logout = (_req: Request, res: Response): void => {
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
  res.status(200).json({ success: true, message: "Logged out", data: null });
};

export const session = (req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: "Session active",
    data: {
      user: { ...req.user, mustChangePassword: req.passwordChangeRequired === true },
      termsAccepted: req.termsAccepted === true,
      mustChangePassword: req.passwordChangeRequired === true,
      expiresAt: req.user?.exp ? new Date(req.user.exp * 1000).toISOString() : null,
    },
  });
};

export const acceptTerms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const acceptedAt = new Date();
    let user = await User.findOneAndUpdate(
      {
        _id: req.user.id,
        $or: [
          { termsAccepted: { $ne: true } },
          { termsAcceptedAt: null },
          { termsVersionAccepted: { $ne: CURRENT_TERMS_VERSION } },
        ],
      },
      { $set: { termsAccepted: true, termsAcceptedAt: acceptedAt, termsVersionAccepted: CURRENT_TERMS_VERSION } },
      { returnDocument: "after" },
    );
    if (!user) user = await User.findById(req.user.id);
    if (!user || !user.isActive) throw new AppError("Session is no longer valid", 401);
    res.status(200).json({
      success: true,
      message: "Terms and Agreement accepted",
      data: {
        termsAccepted: true,
        termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? acceptedAt.toISOString(),
        termsVersion: CURRENT_TERMS_VERSION,
      },
    });
  } catch (error) { next(error); }
};
