import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import connectDB from "@/lib/db";
import Broadcast from "@/models/Broadcast";
import Order from "@/models/Order";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminAuth();
  if (auth instanceof NextResponse) return auth;

  await connectDB();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // 1. Today's orders count
  const todayOrdersCount = await Order.countDocuments({
    createdAt: { $gte: startOfDay },
  });

  // 2. Today's revenue from paid orders
  const revenueAgg = await Order.aggregate([
    {
      $match: {
        status: { $in: ["paid", "preparing", "out_for_delivery", "delivered"] },
        createdAt: { $gte: startOfDay },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$total" },
      },
    },
  ]);
  const todayRevenue = revenueAgg[0]?.total || 0;

  // 3. Pending custom requests
  const pendingCustomRequests = await Order.countDocuments({
    type: "custom",
    status: "pending_payment",
  });

  // 4. Daily broadcast stats & response rate
  const broadcast = await Broadcast.findOne({ date: todayStr }).lean();
  const sentCount = broadcast?.sentCount || 0;
  const yesCount = broadcast?.yesCount || 0;
  const noCount = broadcast?.noCount || 0;
  const noReplyCount = Math.max(0, sentCount - (yesCount + noCount));
  const responseRate =
    sentCount > 0 ? Math.round(((yesCount + noCount) / sentCount) * 100) : 0;

  // 5. Recent 10 orders with user details
  const recentOrders = await Order.find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("userId", "phone name")
    .lean();

  return NextResponse.json({
    metrics: {
      todayOrdersCount,
      todayRevenue,
      pendingCustomRequests,
      broadcast: {
        date: todayStr,
        sentCount,
        yesCount,
        noCount,
        noReplyCount,
        responseRate,
      },
    },
    recentOrders,
  });
}
