import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IPayment extends Document {
  orderId: Types.ObjectId;
  provider: string;
  linkId?: string;
  providerPaymentId?: string;
  amount: number;
  currency: string;
  status: "created" | "paid" | "failed" | "expired";
  rawEvent?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      default: "razorpay",
      required: true,
    },
    linkId: {
      type: String,
      index: true,
      trim: true,
    },
    providerPaymentId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["created", "paid", "failed", "expired"],
      default: "created",
      index: true,
    },
    rawEvent: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

export const Payment: Model<IPayment> =
  mongoose.models.Payment || mongoose.model<IPayment>("Payment", PaymentSchema);

export default Payment;
