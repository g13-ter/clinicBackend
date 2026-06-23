import { Request, Response } from "express";
import ClinicVisit from "../models/clinicVisit.model";


// CREATE VISIT
export const createVisit = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const {
      patientId,
      complaint,
      treatment,
      notes
    } = req.body;


    // validation
    if (!patientId || !complaint) {

      res.status(400).json({
        message: "Patient ID and Complaint are required"
      });

      return;
    }


    const visit = await ClinicVisit.create({
      patientId,
      complaint,
      treatment,
      notes
    });


    res.status(201).json({
      message: "Clinic visit created successfully",
      visit
    });

  } catch (error: any) {

    res.status(500).json({
      message: error.message
    });

  }

};


// GET ALL VISITS OF A PATIENT
export const getVisitsByPatient = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const patientId = req.params.patientId;

    if (!patientId) {

      res.status(400).json({
        message: "Patient ID is required"
      });

      return;
    }


    const visits = await ClinicVisit.find({
      patientId: patientId
    })
      .populate("patientId")
      .sort({
        visitDate: -1
      });


    res.status(200).json(visits);

  } catch (error: any) {

    res.status(500).json({
      message: error.message
    });

  }

};


// GET SINGLE VISIT
export const getVisitById = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const visit = await ClinicVisit.findById(
      req.params.id
    ).populate("patientId");


    if (!visit) {

      res.status(404).json({
        message: "Clinic visit not found"
      });

      return;
    }


    res.status(200).json(visit);

  } catch (error: any) {

    res.status(500).json({
      message: error.message
    });

  }

};


// UPDATE VISIT
export const updateVisit = async (
  req: Request,
  res: Response
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

      res.status(404).json({
        message: "Clinic visit not found"
      });

      return;
    }


    res.status(200).json({
      message: "Clinic visit updated successfully",
      visit
    });

  } catch (error: any) {

    res.status(500).json({
      message: error.message
    });

  }

};


// DELETE VISIT
export const deleteVisit = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const visit =
      await ClinicVisit.findByIdAndDelete(
        req.params.id
      );

    if (!visit) {

      res.status(404).json({
        message: "Clinic visit not found"
      });

      return;
    }


    res.status(200).json({
      message: "Clinic visit deleted successfully"
    });

  } catch (error: any) {

    res.status(500).json({
      message: error.message
    });

  }

};