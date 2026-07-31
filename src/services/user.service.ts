import User, { IUser } from "../models/user.model";
import bcrypt from "bcryptjs";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import type { UserRole } from "../types/roles";

export class UserService {
  async createUser(data: { name: string; email: string; password: string; role: UserRole }): Promise<IUser> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new AppError(
        existing.isActive
          ? "Email already in use"
          : "An inactive account already uses this email. Reactivate that account instead.",
        409
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return await User.create({
      ...data,
      email: normalizedEmail,
      password: hashedPassword,
    });
  }

  async getUsers(
    { limit, skip }: PaginationParams
  ): Promise<{ users: IUser[]; total: number }> {
    const [users, total] = await Promise.all([
      User.find().select("-password").sort({ isActive: -1, name: 1 }).skip(skip).limit(limit),
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

  // Small lookup list for booking and schedule management.
  async getDoctors(): Promise<IUser[]> {
    // Missing isActive means a legacy account created before deactivation was
    // introduced. Treat it as active until the idempotent backfill runs.
    return await User.find({ role: "doctor", isActive: { $ne: false } })
      .select("name email isAvailable scheduleNotes")
      .sort({ name: 1 });
  }

  // Small recipient list for admin notifications.
  async getAdminEmails(): Promise<string[]> {
    const admins = await User.find({ role: "admin", isActive: { $ne: false } }).select("email");
    return admins.map((admin) => admin.email);
  }

  async updateUser(id: string, data: Partial<{ name: string; email: string; password: string; role: UserRole; isActive: boolean; isAvailable: boolean; scheduleNotes: string }>): Promise<{ before: IUser; after: IUser }> {
    const before = await User.findById(id).select("-password");

    if (!before) {
      throw new AppError("User not found", 404);
    }

    const updateData: Partial<Pick<IUser, "name" | "email" | "password" | "role" | "isActive" | "isAvailable" | "scheduleNotes" | "deactivatedAt" | "deactivatedBy">> & {
      $inc?: { sessionVersion: number };
      $unset?: { deactivatedAt: 1; deactivatedBy: 1 };
    } = {
      ...data,
    };

    if (data.email) updateData.email = data.email.trim().toLowerCase();
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }
    if (data.password || data.role || data.isActive !== undefined) {
      updateData.$inc = { sessionVersion: 1 };
    }
    if (data.isActive === true) {
      updateData.$unset = { deactivatedAt: 1, deactivatedBy: 1 };
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

  async deactivateUser(id: string, performedBy: string): Promise<{ before: IUser; after: IUser }> {
    if (id === performedBy) {
      throw new AppError("You cannot deactivate your own account", 400);
    }

    const before = await User.findById(id).select("-password");
    if (!before) {
      throw new AppError("User not found", 404);
    }
    if (!before.isActive) {
      throw new AppError("User is already inactive", 409);
    }
    if (before.role === "admin") {
      const activeAdminCount = await User.countDocuments({ role: "admin", isActive: { $ne: false } });
      if (activeAdminCount <= 1) {
        throw new AppError("The last active administrator cannot be deactivated", 409);
      }
    }

    const after = await User.findByIdAndUpdate(
      id,
      {
        $set: {
          isActive: false,
          isAvailable: false,
          deactivatedAt: new Date(),
          deactivatedBy: performedBy,
        },
        $inc: { sessionVersion: 1 },
      },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    if (!after) throw new AppError("User not found", 404);
    return { before, after };
  }
}
