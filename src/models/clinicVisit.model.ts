import mongoose, {
  Schema,
  Document
} from "mongoose";

export interface IClinicVisit
  extends Document {

  patientId: mongoose.Types.ObjectId;

  complaint: string;

  treatment: string;

  notes: string;

  visitDate: Date;

}

const ClinicVisitSchema =
  new Schema<IClinicVisit>(
    {

      patientId: {
        type: Schema.Types.ObjectId,
        ref: "Patient",
        required: true,
      },

      complaint: {
        type: String,
        required: true,
      },

      treatment: {
        type: String,
      },

      notes: {
        type: String,
      },

      visitDate: {
        type: Date,
        default: Date.now,
      },

    },

    {
      timestamps: true,
    }
  );

const ClinicVisit = mongoose.model<IClinicVisit>(
    "ClinicVisit",
    ClinicVisitSchema
  );

export default ClinicVisit;