import { Request, Response } from "express";
import Patient from "../models/patient.model";


// CREATE PATIENT
export const createPatient = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const patient = await Patient.create(req.body);

    res.status(201).json(patient);

  } catch (error: any) {

    res.status(400).json({
      message: error.message,
    });

  }

};


// GET ALL PATIENTS
export const getPatients = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const patients = await Patient.find();

    res.status(200).json(patients);

  } catch (error: any) {

    res.status(500).json({
      message: error.message,
    });

  }

};


// GET PATIENT BY ID
export const getPatientById = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const patient = await Patient.findById(
      req.params.id
    );

    if (!patient) {

      res.status(404).json({
        message: "Patient not found",
      });

      return;
    }

    res.status(200).json(patient);

  } catch (error: any) {

    res.status(500).json({
      message: error.message,
    });

  }

};


// UPDATE PATIENT
export const updatePatient = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const patient =
      await Patient.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );

    if (!patient) {

      res.status(404).json({
        message: "Patient not found",
      });

      return;
    }

    res.status(200).json(patient);

  } catch (error: any) {

    res.status(500).json({
      message: error.message,
    });

  }

};


// DELETE PATIENT
export const deletePatient = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const patient =
      await Patient.findByIdAndDelete(
        req.params.id
      );

    if (!patient) {

      res.status(404).json({
        message: "Patient not found",
      });

      return;
    }

    res.status(200).json({
      message: "Patient deleted successfully",
    });

  } catch (error: any) {

    res.status(500).json({
      message: error.message,
    });

  }

};