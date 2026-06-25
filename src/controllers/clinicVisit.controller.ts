import { Request, Response, NextFunction } from "express";
import ClinicVisit from "../models/clinicVisit.model";
import { AppError } from "../middleware/error.middleware";


// CREATE VISIT
export const createVisit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const {
      patientId,
      complaint,
      treatment,
      notes,
      bloodPressure,
      temperature,
      pulseRate
    } = req.body;


    // recordedBy comes from the logged-in nurse's token
    const recordedBy = (req as any).user.id;


    const visit = await ClinicVisit.create({
      patientId,
      complaint,
      treatment,
      notes,
      bloodPressure,
      temperature,
      pulseRate,
      recordedBy
    });


    res.status(201).json({
      message: "Clinic visit created successfully",
      visit
    });

  } catch (error) {

    next(error);

  }

};


// GET ALL VISITS OF A PATIENT
export const getVisitsByPatient = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const patientId = req.params.patientId;

    if (!patientId) {
      throw new AppError("Patient ID is required", 400);
    }

    const visits = await ClinicVisit.find({
      patientId: patientId,
      isActive: true
    })
      .populate("patientId")
      .sort({
        visitDate: -1
      });


    res.status(200).json(visits);

  } catch (error) {

    next(error);

  }

};


// GET SINGLE VISIT
export const getVisitById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const visit = await ClinicVisit.findById(
      req.params.id
    ).populate("patientId");


    if (!visit) {
      throw new AppError("Clinic visit not found", 404);
    }


    res.status(200).json(visit);

  } catch (error) {

    next(error);

  }

};


// UPDATE VISIT
export const updateVisit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const visit =
      await ClinicVisit.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true,
          runValidators: true
        }
      );

    if (!visit) {
      throw new AppError("Clinic visit not found", 404);
    }


    res.status(200).json({
      message: "Clinic visit updated successfully",
      visit
    });

  } catch (error) {

    next(error);

  }

};


// ARCHIVE VISIT (soft delete - admin only)
export const archiveVisit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const visit =
      await ClinicVisit.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true }
      );

    if (!visit) {
      throw new AppError("Clinic visit not found", 404);
    }


    res.status(200).json({
      message: "Clinic visit archived successfully",
      visit
    });

  } catch (error) {

    next(error);

  }

};