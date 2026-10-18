import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/auth";
import { BotMessages } from "@/lib/bot/messages";
import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import { sendButtons } from "@/lib/whatsapp/client";
import Order from "@/models/Order";
import Session from "@/models/Session";
import User from "@/models/User";

const quoteSchema = z.object({
  amount: z.number().positive("Quote amount must be greater than zero"),
  note: z.string().optional(),
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
    const { amount, note } = quoteSchema.parse(body);

    await connectDB();

    const order = await Order.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNo: id }],
      type: "custom",
    });

    if (!order) {
      return NextResponse.json({ error: "Custom order not found" }, { status: 404 });
    }

    // Save quote to order
    order.quote = {
      amount,
      note,
      quotedBy: (auth.user as any).id,
      quotedAt: new Date(),
    };
    order.total = amount;
    order.statusHistory.push({
      status: order.status,
      changedAt: new Date(),
      changedBy: (auth.user as any).name || "Staff",
      note: `Quote provided: ₹${amount}${note ? ` (${note})` : ""}`,
    });
    await order.save();

    // Advance user session to CONFIRM
    await Session.findOneAndUpdate(
      { userId: order.userId },
      {
        step: "CONFIRM",
        tempData: {
          orderNo: order.orderNo,
          orderType: "custom",
          quote: { amount, note },
          total: amount,
        },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour for quote review
      }
    );

    // Send WhatsApp quote buttons to customer
    const user = await User.findById(order.userId);
    if (user?.phone) {
      await sendButtons(
        user.phone,
        BotMessages.quoteReceivedPrompt(amount, note),
        BotMessages.quoteButtons
      );
      logger.info({ orderNo: order.orderNo, amount, phone: user.phone }, "Dispatched custom quote buttons to customer");
    }

    return NextResponse.json({
      success: true,
      quote: order.quote,
      total: order.total,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    logger.error({ error }, "Error setting quote for order");
    return NextResponse.json({ error: "Failed to set quote" }, { status: 500 });
  }
}
