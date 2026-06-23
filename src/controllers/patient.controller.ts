import Patient from "../models/patient.model";

// CREATE patient
export const createPatient = async (req: any, res: any) => {

  try {

    // sulayi save ang patient
    const patient = await Patient.create(req.body);

    res.status(201).json(patient);

  } catch (error: any) {

    // kung naay error, ipadala
    res.status(400).json({
      message: error.message
    });

  }
};


// GET all patients
export const getPatients = async (req: any, res: any) => {

  // kuhaon tanan patients
  const patients = await Patient.find();

  res.json(patients);
};


// GET single patient
export const getPatientById = async (req: any, res: any) => {

  const patient = await Patient.findById(req.params.id);

  res.json(patient);
};


// UPDATE patient
export const updatePatient = async (req: any, res: any) => {

  const patient = await Patient.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

  res.json(patient);
};


// DELETE patient
export const deletePatient = async (req: any, res: any) => {

  const patient = await Patient.findByIdAndDelete(req.params.id);

  res.json(patient);
};

