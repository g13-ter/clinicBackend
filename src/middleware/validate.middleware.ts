import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodIssue } from "zod";


// reusable middleware - pass in any zod schema and it will
// check req.body against it before letting the request through
export const validateBody = (schema: ZodSchema) => {

  return (req: Request, res: Response, next: NextFunction) => {

    const result = schema.safeParse(req.body);

    if (!result.success) {

      // zod gives us a detailed list of what went wrong
      const errors = result.error.issues.map((issue: ZodIssue) => ({
        field: issue.path.join("."),
        message: issue.message
      }));

      res.status(400).json({
        message: "Validation failed",
        errors
      });

      return;
    }

    // replace req.body with the parsed/cleaned data
    req.body = result.data;

    next();

  };

};