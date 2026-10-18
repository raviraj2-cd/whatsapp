import mongoose, { Document, Model, Schema } from "mongoose";

export interface IBusinessInfo {
  name: string;
  address?: string;
  phone?: string;
  upiId?: string;
}

export interface IFlowIds {
  menuOrder?: string;
  customOrder?: string;
  viewOrder?: string;
}

export interface ISettings extends Document {
  key: string;
  dailySendTime: string;
  cutoffTime: string;
  deliveryCharge: number;
  sessionTimeoutMin: number;
  businessInfo: IBusinessInfo;
  flowIds: IFlowIds;
  createdAt: Date;
  updatedAt: Date;
}

const SettingsSchema = new Schema<ISettings>(
  {
    key: {
      type: String,
      default: "app_settings",
      unique: true,
      index: true,
    },
    dailySendTime: {
      type: String,
      default: "09:00",
      trim: true,
    },
    cutoffTime: {
      type: String,
      default: "13:00",
      trim: true,
    },
    deliveryCharge: {
      type: Number,
      default: 30,
      min: 0,
    },
    sessionTimeoutMin: {
      type: Number,
      default: 30,
      min: 5,
    },
    businessInfo: {
      name: { type: String, default: "WhatsApp Gourmet Kitchen" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      upiId: { type: String, default: "" },
    },
    flowIds: {
      menuOrder: { type: String, default: "" },
      customOrder: { type: String, default: "" },
      viewOrder: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

export const Settings: Model<ISettings> =
  mongoose.models.Settings ||
  mongoose.model<ISettings>("Settings", SettingsSchema);

export default Settings;
