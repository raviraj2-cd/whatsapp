import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IMessageLog extends Document {
  direction: "inbound" | "outbound";
  waMessageId?: string;
  userId?: Types.ObjectId;
  type: string;
  payload?: Record<string, unknown>;
  status: "sent" | "delivered" | "read" | "failed" | "received";
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageLogSchema = new Schema<IMessageLog>(
  {
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
      index: true,
    },
    waMessageId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    payload: {
      type: Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read", "failed", "received"],
      default: "received",
      index: true,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

MessageLogSchema.index({ createdAt: -1 });

export const MessageLog: Model<IMessageLog> =
  mongoose.models.MessageLog ||
  mongoose.model<IMessageLog>("MessageLog", MessageLogSchema);

export default MessageLog;
