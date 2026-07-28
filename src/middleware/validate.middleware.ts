import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodIssue } from "zod";


// Validate and sanitize request bodies with a Zod schema.
export const validateBody = (schema: ZodSchema) => {

  return (req: Request, res: Response, next: NextFunction) => {

    const result = schema.safeParse(req.body);

    if (!result.success) {

      // Return field-level validation errors.
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

    // Use Zod's parsed and sanitized data.
    req.body = result.data;

    next();

  };

};
