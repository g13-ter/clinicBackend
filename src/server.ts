import express, { Application, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db";
import userRoutes from "./routes/user.routes"; // Import routes
import patientRoutes from "./routes/patient.routes";
import authRoutes from "./routes/auth.routes";
import clinicVisitRoutes from "./routes/clinicVisit.routes";

dotenv.config();

connectDB();

const app: Application = express();

app.use(cors());
app.use(express.json());

app.use("/api/users", userRoutes);
// Register user routes

app.use("/api/patients", patientRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/visits",clinicVisitRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("School clinic API Running");
});

const PORT: number = 5000;

app.listen(PORT, () => {
  console.log(`Server running on Port ${PORT}`);
});