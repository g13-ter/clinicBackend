import { Request, Response, NextFunction } from "express";
import User from "../models/user.model";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError } from "../middleware/error.middleware";


// LOGIN USER
// Accounts are created by an admin via POST /api/users — there is
// no public self-registration. This is the only public auth route.
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    // kuhaa email ug password gikan sa request
    const { email, password } = req.body;


    // pangitaon ang user gamit ang email
    const user = await User.findOne({ email } as any);


    // kung walay user nga makita
    if (!user) {
      throw new AppError("User not found", 404);
    }


    // icompare ang gi-input nga password ug ang encrypted password sa database
    const isMatch = await bcrypt.compare(
      password,
      user.password
    );


    // kung sayop ang password
    if (!isMatch) {
      throw new AppError("Invalid password", 400);
    }


    // himo ug JWT token para ma-authenticate ang user
    // process.env.JWT_SECRET is guaranteed to exist here because
    // server.ts checks for it on startup and exits if it's missing
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role
      },
      process.env.JWT_SECRET as string,
      {
        expiresIn: (process.env.JWT_EXPIRE || "1d") as any
      }
    );


    // ipadala ang token
    res.json({
      token
    });


  } catch (error) {

    next(error);

  }
};