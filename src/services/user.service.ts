import User, { IUser } from "../models/user.model";
import bcrypt from "bcryptjs";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import type { UserRole } from "../types/roles";
import type { ClientSession } from "mongoose";
import PrivilegedAccountGuard from "../models/privilegedAccountGuard.model";

export class UserService {
  private async lockPrivilegedInvariant(session?: ClientSession): Promise<void> {
    await PrivilegedAccountGuard.findOneAndUpdate(
      { key: "privileged-account-invariant" },
      { $inc: { revision: 1 }, $setOnInsert: { key: "privileged-account-invariant" } },
      { upsert: true, returnDocument: "after", ...(session ? { session } : {}) },
    );
  }

  private isPrivilegedRole(role: UserRole): boolean {
    return role === "admin" || role === "superadmin";
  }

  private async requireStepUp(
    actorId: string,
    actorRole: UserRole,
    actorPassword: string | undefined,
    required: boolean,
    session?: ClientSession,
  ): Promise<void> {
    if (!required) return;
    if (actorRole !== "admin" && actorRole !== "superadmin") {
      throw new AppError("Only an administrator can perform this account action", 403);
    }
    if (!actorPassword) {
      throw new AppError("Confirm your current password to perform this privileged action", 403);
    }
    const actor = await User.findById(actorId).select("+password").session(session ?? null);
    if (!actor || !(await bcrypt.compare(actorPassword, actor.password))) {
      throw new AppError("Current password is incorrect", 403);
    }
  }

  private assertCanManageRole(actorRole: UserRole, targetRole: UserRole): void {
    if (actorRole !== "superadmin" && (targetRole === "superadmin" || targetRole === "admin")) {
      throw new AppError("Only a Super Admin can manage administrative accounts", 403);
    }
  }

  async createUser(actorId: string, actorRole: UserRole, actorPassword: string | undefined, data: { name: string; email: string; password: string; role: UserRole }, session?: ClientSession): Promise<IUser> {
    this.assertCanManageRole(actorRole, data.role);
    await this.requireStepUp(actorId, actorRole, actorPassword, true, session);
    const normalizedEmail = data.email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail }).session(session ?? null);
    if (existing) {
      throw new AppError(
        existing.isActive
          ? "Email already in use"
          : "An inactive account already uses this email. Reactivate that account instead.",
        409
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const [created] = await User.create([{
      ...data,
      email: normalizedEmail,
      password: hashedPassword,
      mustChangePassword: true,
    }], session ? { session } : {});
    return created!;
  }

  async getUsers(
    { limit, skip }: PaginationParams,
    actorRole: UserRole,
  ): Promise<{ users: IUser[]; total: number }> {
    const filter = actorRole === "superadmin"
      ? {}
      : { role: { $nin: ["superadmin", "admin"] as UserRole[] } };
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .populate("deactivatedBy", "name email role")
        .sort({ isActive: -1, name: 1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return { users, total };
  }

  async getUserById(id: string, actorRole?: UserRole): Promise<IUser> {
    const user = await User.findById(id).select("-password");
    if (!user) {
      throw new AppError("User not found", 404);
    }
    if (actorRole) this.assertCanManageRole(actorRole, user.role);
    return user;
  }

  async updateOwnProfile(
    id: string,
    data: { name?: string; email?: string; currentPassword: string; newPassword?: string },
  ): Promise<{ before: IUser; after: IUser; sessionRevoked: boolean }> {
    const user = await User.findById(id).select("+password +sessionVersion");
    if (!user || !user.isActive) throw new AppError("User not found", 404);
    if (!(await bcrypt.compare(data.currentPassword, user.password))) {
      throw new AppError("Current password is incorrect", 403);
    }
    if (data.email) {
      const normalized = data.email.trim().toLowerCase();
      const duplicate = await User.exists({ email: normalized, _id: { $ne: id } });
      if (duplicate) throw new AppError("Email already in use", 409);
    }
    const before = user;
    const sessionRevoked = Boolean(data.newPassword);
    const after = await User.findByIdAndUpdate(
      id,
      {
        ...(data.name ? { name: data.name } : {}),
        ...(data.email ? { email: data.email.trim().toLowerCase() } : {}),
        ...(data.newPassword ? { password: await bcrypt.hash(data.newPassword, 10), mustChangePassword: false } : {}),
        ...(sessionRevoked ? { $inc: { sessionVersion: 1 } } : {}),
      },
      { returnDocument: "after", runValidators: true },
    ).select("-password");
    if (!after) throw new AppError("User not found", 404);
    return { before, after, sessionRevoked };
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

  async updateUser(id: string, actorId: string, actorRole: UserRole, actorPassword: string | undefined, data: Partial<{ name: string; email: string; password: string; role: UserRole; isActive: boolean; isAvailable: boolean; scheduleNotes: string }>, session?: ClientSession): Promise<{ before: IUser; after: IUser }> {
    const before = await User.findById(id).select("-password").session(session ?? null);

    if (!before) {
      throw new AppError("User not found", 404);
    }
    this.assertCanManageRole(actorRole, before.role);
    if (data.role) this.assertCanManageRole(actorRole, data.role);
    await this.requireStepUp(
      actorId,
      actorRole,
      actorPassword,
      true,
      session,
    );
    if (id === actorId && before.role === "superadmin" && data.role && data.role !== "superadmin") {
      throw new AppError("You cannot change your own Super Admin role", 400);
    }
    if (data.role && data.role !== before.role && this.isPrivilegedRole(before.role)) {
      await this.lockPrivilegedInvariant(session);
      const activeRoleCount = await User.countDocuments({
        role: before.role,
        isActive: { $ne: false },
      }).session(session ?? null);
      if (activeRoleCount <= 1) {
        throw new AppError(`The last active ${before.role === "superadmin" ? "Super Admin" : "administrator"} cannot change roles`, 409);
      }
    }

    const updateData: Partial<Pick<IUser, "name" | "email" | "password" | "role" | "isActive" | "isAvailable" | "scheduleNotes" | "deactivatedAt" | "deactivatedBy" | "mustChangePassword">> & {
      $inc?: { sessionVersion: number };
      $unset?: { deactivatedAt: 1; deactivatedBy: 1 };
    } = {
      ...data,
    };

    if (data.email) {
      const normalizedEmail = data.email.trim().toLowerCase();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: id } }).session(session ?? null);
      if (existing) throw new AppError("Email already in use", 409);
      updateData.email = normalizedEmail;
    }
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
      updateData.mustChangePassword = true;
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
      ...(session ? { session } : {}),
    }).select("-password");

    if (!after) {
      throw new AppError("User not found", 404);
    }

    return { before, after };
  }

  async deactivateUser(id: string, performedBy: string, actorRole: UserRole, actorPassword?: string, session?: ClientSession): Promise<{ before: IUser; after: IUser }> {
    if (id === performedBy) {
      throw new AppError("You cannot deactivate your own account", 400);
    }

    const before = await User.findById(id).select("-password").session(session ?? null);
    if (!before) {
      throw new AppError("User not found", 404);
    }
    this.assertCanManageRole(actorRole, before.role);
    await this.requireStepUp(
      performedBy,
      actorRole,
      actorPassword,
      true,
      session,
    );
    if (!before.isActive) {
      throw new AppError("User is already inactive", 409);
    }
    if (before.role === "admin") {
      await this.lockPrivilegedInvariant(session);
      const activeAdminCount = await User.countDocuments({ role: "admin", isActive: { $ne: false } }).session(session ?? null);
      if (activeAdminCount <= 1) {
        throw new AppError("The last active administrator cannot be deactivated", 409);
      }
    }
    if (before.role === "superadmin") {
      await this.lockPrivilegedInvariant(session);
      const activeSuperAdminCount = await User.countDocuments({ role: "superadmin", isActive: { $ne: false } }).session(session ?? null);
      if (activeSuperAdminCount <= 1) {
        throw new AppError("The last active Super Admin cannot be deactivated", 409);
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
      { returnDocument: "after", runValidators: true, ...(session ? { session } : {}) }
    ).select("-password");

    if (!after) throw new AppError("User not found", 404);
    return { before, after };
  }

}
