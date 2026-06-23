import { Request, Response } from "express";
import User from "../models/user.model";
import bcrypt from "bcryptjs";


// CREATE USER
export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    // kuhaon data gikan sa body
    const { name, email, password, role } = req.body;


    // validation
    if (!name || !email || !password || !role) {

      res.status(400).json({
        message: "All fields are required",
      });

      return;
    }


    // check kung naa na ang email
    const existingUser = await User.findOne({
      email,
    });

    if (existingUser) {

      res.status(400).json({
        message: "Email already exists",
      });

      return;
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

    res.status(500).json({
      message: "Server Error",
      error,
    });

  }

};


// GET ALL USERS
export const getUsers = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const users = await User.find()
      .select("-password");

    res.status(200).json(users);

  } catch (error) {

    res.status(500).json({
      message: "Server Error",
      error,
    });

  }

};


// GET USER BY ID
export const getUserById = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const user = await User.findById(
      req.params.id
    ).select("-password");


    if (!user) {

      res.status(404).json({
        message: "User not found",
      });

      return;
    }


    res.status(200).json(user);

  } catch (error) {

    res.status(500).json({
      message: "Server Error",
      error,
    });

  }

};


// DELETE USER
export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const user = await User.findByIdAndDelete(
      req.params.id
    );


    if (!user) {

      res.status(404).json({
        message: "User not found",
      });

      return;
    }


    res.status(200).json({
      message: "User deleted successfully",
    });

  } catch (error) {

    res.status(500).json({
      message: "Server Error",
      error,
    });

  }

};