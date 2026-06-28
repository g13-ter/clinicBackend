import Appointment, { IAppointment } from "../models/appointment.model";
import { AppError } from "../middleware/error.middleware";
import { PaginationParams } from "../utils/pagination";
import { escapeRegex } from "../utils/regex";

export class AppointmentService {
  async createAppointment(data: Partial<IAppointment>): Promise<IAppointment> {
    return await Appointment.create(data);
  }

  async getAppointments(
    { limit, skip }: PaginationParams,
    search?: string
  ): Promise<{ appointments: IAppointment[]; total: number }> {
    const filter: any = {};

    if (search) {
      filter.reason = { $regex: escapeRegex(search), $options: "i" };
    }

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .populate("patientId", "studentId firstName lastName")
        .populate("createdBy", "name role")
        .populate("updatedBy", "name role")
        .sort({ appointmentDate: 1 })
        .skip(skip)
        .limit(limit),
      Appointment.countDocuments(filter),
    ]);

    return { appointments, total };
  }

  async getAppointmentById(id: string): Promise<IAppointment> {
    const appointment = await Appointment.findById(id)
      .populate("patientId", "studentId firstName lastName")
      .populate("createdBy", "name role")
      .populate("updatedBy", "name role");

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    return appointment;
  }

  async updateAppointment(id: string, data: Partial<IAppointment>): Promise<{ before: IAppointment; after: IAppointment }> {
    const before = await Appointment.findById(id);

    if (!before) {
      throw new AppError("Appointment not found", 404);
    }

    const after = await Appointment.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!after) {
      throw new AppError("Appointment not found", 404);
    }

    return { before, after };
  }
}