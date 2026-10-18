import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Order from "@/models/Order";

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // "menu" | "custom"
  const status = searchParams.get("status");
  const date = searchParams.get("date"); // "YYYY-MM-DD"

  const filter: Record<string, unknown> = {};

  if (type && ["menu", "custom"].includes(type)) {
    filter.type = type;
  }

  if (status && status !== "all") {
    filter.status = status;
  }

  if (date) {
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);
    filter.createdAt = { $gte: startDate, $lt: endDate };
  }

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .populate("userId", "phone name")
    .lean();

  return NextResponse.json({ orders });
}
