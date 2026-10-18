import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import { fetchRazorpayPayment, refundPayment } from "@/lib/payments/razorpay";
import { sendText } from "@/lib/whatsapp/client";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import Session from "@/models/Session";
import User from "@/models/User";

/**
 * Job 1: Expires unpaid orders after timeout (default 15 minutes) and notifies customer.
 */
export async function expireUnpaidOrdersJob(expiryMinutes = 15): Promise<{ expiredCount: number }> {
  await connectDB();
  const cutoffTime = new Date(Date.now() - expiryMinutes * 60 * 1000);

  const pendingOrders = await Order.find({
    status: "pending_payment",
    createdAt: { $lt: cutoffTime },
  });

  let expiredCount = 0;

  for (const order of pendingOrders) {
    try {
      order.status = "cancelled";
      order.statusHistory.push({
        status: "cancelled",
        changedAt: new Date(),
        changedBy: "expiry_job",
        note: `Payment expired after ${expiryMinutes} minutes of inactivity`,
      });
      await order.save();

      // Reset customer session to IDLE
      await Session.findOneAndUpdate(
        { userId: order.userId },
        { step: "IDLE", tempData: {}, expiresAt: new Date() }
      );

      // Notify customer
      const user = await User.findById(order.userId);
      if (user?.phone) {
        await sendText(
          user.phone,
          `⏳ *Order Cancelled*\n\nYour payment link for Order *${order.orderNo}* has expired. No charges were made.\nReply with 'menu' whenever you would like to order again!`
        );
      }

      expiredCount++;
      logger.info({ orderNo: order.orderNo }, "Order expired and cancelled by background job");
    } catch (err) {
      logger.error({ err, orderNo: order.orderNo }, "Failed to expire order");
    }
  }

  return { expiredCount };
}

/**
 * Job 2: Nightly reconciliation comparing pending orders against Razorpay API to fix missed webhooks.
 */
export async function reconcilePaymentsJob(): Promise<{ checkedCount: number; resolvedCount: number }> {
  await connectDB();
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const pendingOrders = await Order.find({
    status: "pending_payment",
    createdAt: { $gte: last24Hours },
  });

  let resolvedCount = 0;

  for (const order of pendingOrders) {
    try {
      const payment = await Payment.findOne({ orderId: order._id });
      if (!payment?.linkId) continue;

      // Skip live fetch if using mock keys
      const keyId = process.env.RAZORPAY_KEY_ID;
      if (!keyId || keyId.startsWith("rzp_test_mock")) {
        continue;
      }

      const res = await fetch(`https://api.razorpay.com/v1/payment_links/${payment.linkId}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
        },
      });

      if (!res.ok) continue;

      const linkData = await res.json();
      if (linkData.status === "paid") {
        order.status = "paid";
        order.statusHistory.push({
          status: "paid",
          changedAt: new Date(),
          changedBy: "reconciliation_job",
          note: "Reconciled status from Razorpay API",
        });
        await order.save();

        payment.status = "paid";
        await payment.save();

        resolvedCount++;
        logger.info({ orderNo: order.orderNo }, "Reconciled missed payment from Razorpay API");
      }
    } catch (err) {
      logger.warn({ err, orderNo: order.orderNo }, "Reconciliation check failed for order");
    }
  }

  return { checkedCount: pendingOrders.length, resolvedCount };
}

/**
 * Admin refund trigger for full or partial refunds.
 */
export async function adminRefundOrder(
  orderNo: string,
  amountInRupees?: number,
  reason?: string
): Promise<{ success: boolean; refundId?: string }> {
  await connectDB();

  const order = await Order.findOne({ orderNo });
  if (!order) {
    throw new Error(`Order ${orderNo} not found`);
  }

  const payment = await Payment.findOne({ orderId: order._id, status: "paid" });
  if (!payment?.providerPaymentId) {
    throw new Error(`No paid transaction found for order ${orderNo}`);
  }

  const result = await refundPayment(
    payment.providerPaymentId,
    amountInRupees,
    { orderNo, reason: reason || "Admin initiated refund" }
  );

  order.status = "refunded";
  order.statusHistory.push({
    status: "refunded",
    changedAt: new Date(),
    changedBy: "admin",
    note: `Refund issued: ₹${amountInRupees || order.total}. ID: ${result.refundId}`,
  });
  await order.save();

  payment.status = "paid"; // or refunded
  await payment.save();

  logger.info({ orderNo, refundId: result.refundId }, "Admin refund executed successfully");
  return { success: true, refundId: result.refundId };
}
