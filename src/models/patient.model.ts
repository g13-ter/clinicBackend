import mongoose from "mongoose";

const patientSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true, // kinahanglan naa
  },
  lastName: {
    type: String,
    required: true,
  },
  age: {
    type: Number,
    required: true,
    min: 0, // dili pwede negative
  },
  gender: {
    type: String,
    required: true,
  },
  contactNumber: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

export default mongoose.model("Patient", patientSchema);