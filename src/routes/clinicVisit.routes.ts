import express from "express";

import {
  createVisit,
  getVisitsByPatient
}
from "../controllers/clinicVisit.controller";

import {
  protect
}
from "../middleware/auth.middleware";

import {
  allowRoles
}
from "../middleware/role.middleware";

const router =
  express.Router();


// Nurse create
router.post(
  "/",
  protect,
  allowRoles(
    "nurse"
  ),
  createVisit
);


// Doctor + Nurse
router.get(
  "/patient/:patientId",
  protect,
  allowRoles(
    "doctor",
    "nurse"
  ),
  getVisitsByPatient
);

export default router;