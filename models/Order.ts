import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type OrderType = "menu" | "custom";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded";

export interface IOrderItem {
  menuItemId?: Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  total: number;
}

export interface IStatusHistory {
  status: OrderStatus;
  changedAt: Date;
  changedBy?: string;
  note?: string;
}

export interface IQuote {
  amount?: number;
  note?: string;
  quotedBy?: Types.ObjectId;
  quotedAt?: Date;
}

export interface IOrder extends Document {
  orderNo: string;
  userId: Types.ObjectId;
  type: OrderType;
  items: IOrderItem[];
  customDetails?: {
    description?: string;
    rawInput?: string;
  };
  quote?: IQuote;
  deliveryType: "delivery" | "pickup";
  address?: string;
  subtotal: number;
  deliveryCharge: number;
  total: number;
  status: OrderStatus;
  statusHistory: IStatusHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["menu", "custom"],
      required: true,
      index: true,
    },
    items: [
      {
        menuItemId: {
          type: Schema.Types.ObjectId,
          ref: "MenuItem",
        },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true, min: 1 },
        total: { type: Number, required: true },
      },
    ],
    customDetails: {
      description: { type: String },
      rawInput: { type: String },
    },
    quote: {
      amount: { type: Number },
      note: { type: String },
      quotedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
      quotedAt: { type: Date },
    },
    deliveryType: {
      type: String,
      enum: ["delivery", "pickup"],
      default: "delivery",
    },
    address: {
      type: String,
      trim: true,
    },
    subtotal: {
      type: Number,
      required: true,
      default: 0,
    },
    deliveryCharge: {
      type: Number,
      required: true,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        "pending_payment",
        "paid",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "pending_payment",
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: String },
        note: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ userId: 1, createdAt: -1 });

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);

export default Order;
