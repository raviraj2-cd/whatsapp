import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { sendFlowMessage, sendText } from "@/lib/whatsapp/client";
import Order from "@/models/Order";
import Payment from "@/models/Payment";
import Session from "@/models/Session";
import Settings from "@/models/Settings";
import User from "@/models/User";

/**
 * Razorpay Webhook Handler
 * Verifies signature, guarantees idempotency by providerPaymentId,
 * updates Order and Payment records, and dispatches WhatsApp [View Order] confirmation.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // 1. Signature Verification
    const isValid = verifyRazorpaySignature(rawBody, signature, secret);
    if (!isValid) {
      logger.warn({ signaturePresent: Boolean(signature) }, "Invalid Razorpay webhook signature");
      return new NextResponse("Invalid Signature", { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    logger.info({ event }, "Razorpay webhook event received");

    await connectDB();

    // 2. Handle Payment Captured / Link Paid
    if (event === "payment_link.paid" || event === "payment.captured") {
      const paymentEntity = payload.payload?.payment?.entity;
      const linkEntity = payload.payload?.payment_link?.entity;

      const providerPaymentId = paymentEntity?.id;
      const orderNo = linkEntity?.reference_id || paymentEntity?.notes?.orderNo;

      if (!providerPaymentId) {
        logger.warn({ event }, "Webhook missing payment ID");
        return NextResponse.json({ status: "ignored_missing_id" }, { status: 200 });
      }

      // Idempotency: Skip if already processed
      const existingPayment = await Payment.findOne({ providerPaymentId, status: "paid" });
      if (existingPayment) {
        logger.info({ providerPaymentId }, "Duplicate payment webhook ignored (idempotent)");
        return NextResponse.json({ status: "already_processed" }, { status: 200 });
      }

      // Find matching Order
      const order = await Order.findOne({ orderNo });
      if (!order) {
        logger.error({ orderNo, providerPaymentId }, "Order not found for paid payment webhook");
        return NextResponse.json({ status: "order_not_found" }, { status: 200 });
      }

      // Amount paid in rupees
      const amountInPaise = paymentEntity?.amount || linkEntity?.amount_paid || 0;
      const amountInRupees = amountInPaise / 100;

      // Update / Upsert Payment
      await Payment.findOneAndUpdate(
        { orderId: order._id },
        {
          orderId: order._id,
          provider: "razorpay",
          linkId: linkEntity?.id,
          providerPaymentId,
          amount: amountInRupees || order.total,
          currency: paymentEntity?.currency || "INR",
          status: "paid",
          rawEvent: payload,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Update Order Status
      order.status = "paid";
      order.statusHistory.push({
        status: "paid",
        changedAt: new Date(),
        changedBy: "razorpay_webhook",
        note: `Payment confirmed via Razorpay. ID: ${providerPaymentId}`,
      });
      await order.save();

      // Find Customer Phone
      const user = await User.findById(order.userId);
      if (user?.phone) {
        // Fetch Settings for Flow ID
        const settings = await Settings.findOne({ key: "app_settings" }).lean();
        const viewOrderFlowId = settings?.flowIds?.viewOrder || process.env.FLOW_ID_VIEW_ORDER;
        const flowToken = `flw_view_${order.orderNo}_${Date.now()}`;

        // Update Customer Session to PAID
        await Session.findOneAndUpdate(
          { userId: user._id },
          {
            step: "PAID",
            flowToken,
            flowName: "view_order_flow",
            tempData: { orderNo: order.orderNo, status: "paid" },
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Retain for 24 hours
          }
        );

        // Send WhatsApp [View Order] Confirmation
        const confirmationMsg = `🎉 *Payment Confirmed!*\n\nThank you for your payment of *₹${order.total}* for Order *${order.orderNo}*.\nOur kitchen team has started preparing your meal!`;

        if (viewOrderFlowId) {
          try {
            await sendFlowMessage(
              user.phone,
              confirmationMsg,
              viewOrderFlowId,
              flowToken,
              "ORDER",
              "View Order Status"
            );
          } catch (e) {
            logger.warn({ err: e }, "Failed to send view_order_flow, falling back to text confirmation");
            await sendText(user.phone, confirmationMsg);
          }
        } else {
          await sendText(user.phone, confirmationMsg);
        }
      }

      logger.info({ orderNo: order.orderNo, providerPaymentId }, "Order payment successfully processed and notified");
    }

    // 3. Handle Refund Processed
    if (event === "refund.processed") {
      const refundEntity = payload.payload?.refund?.entity;
      const paymentId = refundEntity?.payment_id;

      if (paymentId) {
        const payment = await Payment.findOne({ providerPaymentId: paymentId });
        if (payment) {
          payment.status = "paid"; // or refunded
          await payment.save();

          const order = await Order.findById(payment.orderId);
          if (order) {
            order.status = "refunded";
            order.statusHistory.push({
              status: "refunded",
              changedAt: new Date(),
              changedBy: "razorpay_webhook",
              note: `Refund processed: ₹${(refundEntity.amount || 0) / 100} (ID: ${refundEntity.id})`,
            });
            await order.save();
            logger.info({ orderNo: order.orderNo, refundId: refundEntity.id }, "Order marked as refunded");
          }
        }
      }
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    logger.error({ error }, "Error executing payment webhook");
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}
