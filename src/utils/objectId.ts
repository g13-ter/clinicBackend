import mongoose from "mongoose";

export const toObjectId = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);
