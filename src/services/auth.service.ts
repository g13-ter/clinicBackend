import User, { IUser } from "../models/user.model";
import bcrypt from "bcryptjs";
import { AppError } from "../middleware/error.middleware";
import jwt, { SignOptions } from "jsonwebtoken";

export class AuthService {
  async login(email: string, password: string): Promise<string> {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError("Invalid password", 400);
    }


// inside your AuthService or controller
const token = jwt.sign(
  {
    id: user._id,
    role: user.role,
  },
  process.env.JWT_SECRET as string,
  {
    expiresIn: process.env.JWT_EXPIRE || "1d", // must be string or number
  } as SignOptions
);

    return token;
  }
}
