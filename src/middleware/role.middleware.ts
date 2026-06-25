import { Request, Response, NextFunction } from "express";
import { AppError } from "./error.middleware";


// function para mo-check sa allowed roles
export const allowRoles = (...roles: string[]) => {

  return (req: any, res: Response, next: NextFunction) => {


    // kuhaon ang role gikan sa decoded token
    const userRole = req.user.role;


    // kung dili apil ang role
    if (!roles.includes(userRole)) {

      return next(new AppError("Access denied", 403));

    }


    // padayon kung allowed
    next();

  };

};