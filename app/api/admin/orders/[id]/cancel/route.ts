import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/auth";
import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import { sendText } from "@/lib/whatsapp/client";
import Order from "@/models/Order";
import Session from "@/models/Session";
import User from "@/models/User";

const cancelSchema = z.object({
  reason: z.string().min(1, "Cancellation reason is required"),
});

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await request.json();
    const { reason } = cancelSchema.parse(body);

    await connectDB();

    const order = await Order.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNo: id }],
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    order.status = "cancelled";
    order.statusHistory.push({
      status: "cancelled",
      changedAt: new Date(),
      changedBy: (auth.user as any).name || "Staff",
      note: `Cancelled: ${reason}`,
    });
    await order.save();

    // Reset customer session to IDLE
    await Session.findOneAndUpdate(
      { userId: order.userId },
      { step: "IDLE", tempData: {}, expiresAt: new Date() }
    );

    // Notify customer on WhatsApp
    const user = await User.findById(order.userId);
    if (user?.phone) {
      const cancelText = `❌ *Order Cancelled*\n\nYour Order *${order.orderNo}* has been cancelled.\nReason: *${reason}*\n\nPlease reply with 'menu' anytime if you wish to place a new order.`;
      try {
        await sendText(user.phone, cancelText);
      } catch (err) {
        logger.warn({ err, phone: user.phone }, "Failed to send cancellation WhatsApp notice");
      }
    }

    return NextResponse.json({
      success: true,
      orderNo: order.orderNo,
      status: order.status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to cancel order" }, { status: 500 });
  }
}
