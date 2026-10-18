import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface ISession extends Document {
  userId: Types.ObjectId;
  step: string;
  tempData?: Record<string, unknown>;
  flowToken?: string;
  flowName?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    step: {
      type: String,
      required: true,
      default: "IDLE",
    },
    tempData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    flowToken: {
      type: String,
      trim: true,
    },
    flowName: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  }
);

export const Session: Model<ISession> =
  mongoose.models.Session || mongoose.model<ISession>("Session", SessionSchema);

export default Session;
