import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUser extends Document {
  phone: string;
  name?: string;
  address: string[];
  optIn: boolean;
  optInAt?: Date;
  optOutAt?: Date;
  blocked: boolean;
  lastReplyAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
    },
    address: {
      type: [String],
      default: [],
    },
    optIn: {
      type: Boolean,
      default: true,
      index: true,
    },
    optInAt: {
      type: Date,
      default: Date.now,
    },
    optOutAt: {
      type: Date,
    },
    blocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastReplyAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
