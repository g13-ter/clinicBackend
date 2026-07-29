import User from "../models/user.model";
import bcrypt from "bcryptjs";
import { AppError } from "../middleware/error.middleware";
import jwt, { SignOptions } from "jsonwebtoken";
import type { UserRole } from "../types/roles";

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
}

export class AuthService {
  async login(email: string, password: string): Promise<LoginResult> {
    const user = await User.findOne({ email: email.trim().toLowerCase() })
      .select("+sessionVersion");
    if (!user || !user.isActive) {
      throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
    }

    const token = jwt.sign(
      {
        id: String(user._id),
        role: user.role,
        sv: user.sessionVersion,
      },
      process.env.JWT_SECRET as string,
      {
        expiresIn: process.env.JWT_EXPIRE || "1d",
      } as SignOptions
    );

    const decoded = jwt.decode(token);
    const expiresAt =
      decoded && typeof decoded === "object" && typeof decoded.exp === "number"
        ? new Date(decoded.exp * 1000).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
      token,
      expiresAt,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
