import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/auth";
import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import { sendText } from "@/lib/whatsapp/client";
import Order from "@/models/Order";
import User from "@/models/User";

const statusUpdateSchema = z.object({
  status: z.enum([
    "pending_payment",
    "paid",
    "preparing",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "refunded",
  ]),
  note: z.string().optional(),
});

const statusNotificationMap: Record<string, string> = {
  preparing: "🍳 *Kitchen Update*: Your Order is now being freshly prepared in our kitchen!",
  out_for_delivery: "🚴 *Out for Delivery*: Your meal is on the way! Our rider will arrive at your address shortly.",
  delivered: "✅ *Delivered*: Your order has been delivered. Enjoy your meal! Thank you for choosing us.",
  cancelled: "❌ *Order Cancelled*: Your order has been cancelled by the kitchen team.",
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await request.json();
    const validated = statusUpdateSchema.parse(body);

    await connectDB();

    const order = await Order.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNo: id }],
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const previousStatus = order.status;
    order.status = validated.status;
    order.statusHistory.push({
      status: validated.status,
      changedAt: new Date(),
      changedBy: (auth.user as any).name || (auth.user as any).email || "Staff",
      note: validated.note || `Status changed from ${previousStatus} to ${validated.status}`,
    });

    await order.save();

    // Send customer WhatsApp notification
    const user = await User.findById(order.userId);
    if (user?.phone && statusNotificationMap[validated.status]) {
      const msg = `${statusNotificationMap[validated.status]}\n\nOrder No: *${order.orderNo}*${validated.note ? `\nNote: ${validated.note}` : ""}`;
      try {
        await sendText(user.phone, msg);
      } catch (err) {
        logger.warn({ err, phone: user.phone }, "Failed to send status update WhatsApp notification");
      }
    }

    return NextResponse.json({
      success: true,
      order: {
        orderNo: order.orderNo,
        status: order.status,
        statusHistory: order.statusHistory,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
  }
}
