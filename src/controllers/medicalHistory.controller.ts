import { Request, Response } from "express";
import MedicalHistory from "../models/medicalHistory.model";
import Patient from "../models/patient.model";


// CREATE MEDICAL HISTORY
// Called once when a patient's record is first set up
export const createMedicalHistory = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const { patientId } = req.body;

    // patientId is required — everything else is optional
    if (!patientId) {

      res.status(400).json({
        message: "Patient ID is required"
      });

      return;
    }

    // Make sure the patient actually exists in the DB
    const patientExists = await Patient.findById(patientId);

    if (!patientExists) {

      res.status(404).json({
        message: "Patient not found"
      });

      return;
    }

    // Block duplicate — each patient can only have ONE medical history record
    const alreadyExists = await MedicalHistory.findOne({ patientId });

    if (alreadyExists) {

      res.status(409).json({
        message: "Medical history already exists for this patient. Use update instead."
      });

      return;
    }

    const medicalHistory = await MedicalHistory.create(req.body);

    res.status(201).json({
      message: "Medical history created successfully",
      medicalHistory
    });

  } catch (error: any) {

    res.status(500).json({
      message: error.message
    });

  }

};


// GET MEDICAL HISTORY BY PATIENT ID
export const getMedicalHistoryByPatient = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const { patientId } = req.params;

    const medicalHistory = await MedicalHistory
      .findOne({ patientId })
      .populate("patientId");  // pulls in full patient details

    if (!medicalHistory) {

      res.status(404).json({
        message: "No medical history found for this patient"
      });

      return;
    }

    res.status(200).json(medicalHistory);

  } catch (error: any) {

    res.status(500).json({
      message: error.message
    });

  }

};


// UPDATE MEDICAL HISTORY
// Doctors/nurses add new allergies, medications, etc. over time
export const updateMedicalHistory = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const { patientId } = req.params;

    const medicalHistory = await MedicalHistory.findOneAndUpdate(
      { patientId },      // find by patientId, not Mongo _id
      req.body,
      {
        new: true,          // return the updated document
        runValidators: true // enforce schema rules (e.g. bloodType enum)
      }
    );

    if (!medicalHistory) {

      res.status(404).json({
        message: "No medical history found for this patient"
      });

      return;
    }

    res.status(200).json({
      message: "Medical history updated successfully",
      medicalHistory
    });

  } catch (error: any) {

    res.status(500).json({
      message: error.message
    });

  }

};