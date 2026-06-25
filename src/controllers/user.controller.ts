import { Request, Response, NextFunction } from "express";
import User from "../models/user.model";
import bcrypt from "bcryptjs";
import { AppError } from "../middleware/error.middleware";


// CREATE USER
export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    // kuhaon data gikan sa body
    const { name, email, password, role } = req.body;


    // check kung naa na ang email
    const existingUser = await User.findOne({
      email,
    });

    if (existingUser) {
      throw new AppError("Email already exists", 400);
    }


    // hash password
    const salt = await bcrypt.genSalt(10);

    const hashedPassword = await bcrypt.hash(
      password,
      salt
    );


    // create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
    });


    // remove password sa response
    const createdUser = await User.findById(
      user._id
    ).select("-password");


    res.status(201).json({
      message: "User created successfully",
      user: createdUser,
    });

  } catch (error) {

    next(error);

  }

};


// GET ALL USERS
export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const users = await User.find()
      .select("-password");

    res.status(200).json(users);

  } catch (error) {

    next(error);

  }

};


// GET USER BY ID
export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const user = await User.findById(
      req.params.id
    ).select("-password");


    if (!user) {
      throw new AppError("User not found", 404);
    }


    res.status(200).json(user);

  } catch (error) {

    next(error);

  }

};


// UPDATE USER
export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const { name, email, password, role } = req.body;

    const updateData: any = { name, email, role };


    // kung naa bag-ong password, i-hash sa una
    if (password) {

      const salt = await bcrypt.genSalt(10);

      updateData.password = await bcrypt.hash(
        password,
        salt
      );

    }


    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");


    if (!user) {
      throw new AppError("User not found", 404);
    }


    res.status(200).json({
      message: "User updated successfully",
      user,
    });

  } catch (error) {

    next(error);

  }

};


// DELETE USER
export const deleteUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const user = await User.findByIdAndDelete(
      req.params.id
    );


    if (!user) {
      throw new AppError("User not found", 404);
    }


    res.status(200).json({
      message: "User deleted successfully",
    });

  } catch (error) {

    next(error);

  }

};