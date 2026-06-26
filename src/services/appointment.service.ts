import Appointment, { IAppointment } from "../models/appointment.model";
import { AppError } from "../middleware/error.middleware";

export class AppointmentService {
  async createAppointment(data: Partial<IAppointment>): Promise<IAppointment> {
    return await Appointment.create(data);
  }

  async getAppointments(): Promise<IAppointment[]> {
    return await Appointment.find()
      .populate("patientId", "studentId firstName lastName")
      .populate("createdBy", "name role")
      .sort({ appointmentDate: 1 });
  }

  async getAppointmentById(id: string): Promise<IAppointment> {
    const appointment = await Appointment.findById(id)
      .populate("patientId", "studentId firstName lastName")
      .populate("createdBy", "name role");

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    return appointment;
  }

  async updateAppointment(id: string, data: Partial<IAppointment>): Promise<IAppointment> {
    const appointment = await Appointment.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    return appointment;
  }
}
