import mongoose, { Document, Model, Schema } from "mongoose";

export interface IBroadcast extends Document {
  date: string;
  sentCount: number;
  yesCount: number;
  noCount: number;
  noReplyCount: number;
  failedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const BroadcastSchema = new Schema<IBroadcast>(
  {
    date: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    yesCount: {
      type: Number,
      default: 0,
    },
    noCount: {
      type: Number,
      default: 0,
    },
    noReplyCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const Broadcast: Model<IBroadcast> =
  mongoose.models.Broadcast ||
  mongoose.model<IBroadcast>("Broadcast", BroadcastSchema);

export default Broadcast;
