import User, { IUser } from "../models/user.model";
import bcrypt from "bcryptjs";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";

export class UserService {
  async createUser(data: { name: string; email: string; password: string; role: string }): Promise<IUser> {
    const existing = await User.findOne({ email: data.email });
    if (existing) {
      throw new AppError("Email already in use", 400);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return await User.create({
      ...data,
      password: hashedPassword,
    });
  }

  async getUsers(
    { limit, skip }: PaginationParams
  ): Promise<{ users: IUser[]; total: number }> {
    const [users, total] = await Promise.all([
      User.find().select("-password").skip(skip).limit(limit),
      User.countDocuments(),
    ]);

    return { users, total };
  }

  async getUserById(id: string): Promise<IUser> {
    const user = await User.findById(id).select("-password");
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return user;
  }

  async updateUser(id: string, data: Partial<{ name: string; email: string; password: string; role: string }>): Promise<IUser> {
    const updateData: any = { ...data };

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      throw new AppError("User not found", 404);
    }
  }
}