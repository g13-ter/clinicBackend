import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";
import { AppError } from "../middleware/error.middleware";

const authService = new AuthService();

// LOGIN USER
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError("Email and password are required", 400);
    }

    const token = await authService.login(email, password);

    res.json({ token });
  } catch (error) {
    next(error);
  }
};