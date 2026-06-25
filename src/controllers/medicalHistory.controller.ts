import { Request, Response, NextFunction } from "express";
import MedicalHistory from "../models/medicalHistory.model";
import { AppError } from "../middleware/error.middleware";


// CREATE MEDICAL HISTORY ENTRY
export const createMedicalHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const {
      patientId,
      diagnosis,
      prescription,
      familyHistory,
      allergies
    } = req.body;


    const recordedBy = (req as any).user.id;


    const entry = await MedicalHistory.create({
      patientId,
      diagnosis,
      prescription,
      familyHistory,
      allergies,
      recordedBy
    });


    res.status(201).json({
      message: "Medical history entry created successfully",
      entry
    });

  } catch (error) {

    next(error);

  }

};


// GET ALL MEDICAL HISTORY FOR ONE PATIENT
export const getHistoryByPatient = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const patientId = req.params.patientId;

    if (!patientId) {
      throw new AppError("Patient ID is required", 400);
    }

    const history = await MedicalHistory.find({
      patientId: patientId
    })
      .populate("patientId")
      .populate("recordedBy", "name role")
      .sort({
        dateRecorded: -1
      });


    res.status(200).json(history);

  } catch (error) {

    next(error);

  }

};


// GET SINGLE MEDICAL HISTORY ENTRY
export const getHistoryById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const entry = await MedicalHistory.findById(
      req.params.id
    )
      .populate("patientId")
      .populate("recordedBy", "name role");


    if (!entry) {
      throw new AppError("Medical history entry not found", 404);
    }


    res.status(200).json(entry);

  } catch (error) {

    next(error);

  }

};


// UPDATE MEDICAL HISTORY ENTRY
export const updateMedicalHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {

  try {

    const entry = await MedicalHistory.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!entry) {
      throw new AppError("Medical history entry not found", 404);
    }


    res.status(200).json({
      message: "Medical history entry updated successfully",
      entry
    });

  } catch (error) {

    next(error);

  }

};