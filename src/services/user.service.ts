import User, { IUser } from "../models/user.model";
import bcrypt from "bcryptjs";
import { AppError } from "../middleware/error.middleware";

export class UserService {
  async createUser(data: { name: string; email: string; password: string; role: string }): Promise<IUser> {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      throw new AppError("Email already exists", 400);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const user = await User.create({
      name: data.name,
      email: data.email,
      password: hashedPassword,
      role: data.role,
    });

    return await User.findById(user._id).select("-password") as IUser;
  }

  async getUsers(): Promise<IUser[]> {
    return await User.find().select("-password");
  }

  async getUserById(id: string): Promise<IUser> {
    const user = await User.findById(id).select("-password");
    if (!user) {
      throw new AppError("User not found", 404);
    }
    return user;
  }

  async updateUser(id: string, data: { name?: string; email?: string; password?: string; role?: string }): Promise<IUser> {
    const updateData: any = { name: data.name, email: data.email, role: data.role };

    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(data.password, salt);
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
