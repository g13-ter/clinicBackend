import User from "../models/user.model";
import bcrypt from "bcryptjs";
import { AppError } from "../middleware/error.middleware";
import jwt, { SignOptions } from "jsonwebtoken";

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

export class AuthService {
  async login(email: string, password: string): Promise<string> {
    const user = await User.findOne({ email });
    if (!user) {
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
      },
      process.env.JWT_SECRET as string,
      {
        expiresIn: process.env.JWT_EXPIRE || "1d",
      } as SignOptions
    );

    return token;
  }
}