import User, { IUser } from "../models/user.model";
import bcrypt from "bcryptjs";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import type { UserRole } from "../types/roles";

export class UserService {
  async createUser(data: { name: string; email: string; password: string; role: UserRole }): Promise<IUser> {
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

  // Lightweight list for the "select a doctor" step on appointment booking
  // and for admin's doctor-schedule management screen. Deliberately not
  // paginated - clinics have a small, fixed number of doctors.
  async getDoctors(): Promise<IUser[]> {
    return await User.find({ role: "doctor" })
      .select("name email isAvailable scheduleNotes")
      .sort({ name: 1 });
  }

  // Used to notify admins by email (low stock alerts, new purchase
  // requests). Not paginated for the same reason as getDoctors above.
  async getAdminEmails(): Promise<string[]> {
    const admins = await User.find({ role: "admin" }).select("email");
    return admins.map((admin) => admin.email);
  }

  async updateUser(id: string, data: Partial<{ name: string; email: string; password: string; role: UserRole; isAvailable: boolean; scheduleNotes: string }>): Promise<{ before: IUser; after: IUser }> {
    const before = await User.findById(id).select("-password");

    if (!before) {
      throw new AppError("User not found", 404);
    }

    const updateData: any = { ...data };

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    const after = await User.findByIdAndUpdate(id, updateData, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");

    if (!after) {
      throw new AppError("User not found", 404);
    }

    return { before, after };
  }

  async deleteUser(id: string): Promise<IUser> {
    const user = await User.findByIdAndDelete(id).select("-password");
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return user;
  }
}