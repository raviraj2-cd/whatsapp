import crypto from "node:crypto";
import logger from "@/lib/logger";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

export interface CreatePaymentLinkParams {
  orderNo: string;
  amountInRupees: number;
  phone?: string;
  expiryMinutes?: number;
  description?: string;
}

export interface PaymentLinkResult {
  linkId: string;
  shortUrl: string;
  amountInPaise: number;
  expireBy: number;
}

export interface RazorpayRefundResult {
  refundId: string;
  paymentId: string;
  amountInPaise: number;
  status: string;
}

function getBasicAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in environment variables");
  }

  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return `Basic ${credentials}`;
}

/**
 * Creates a Razorpay Payment Link (native API call, no third-party SDK needed).
 * Reference: https://razorpay.com/docs/api/payments/payment-links/create-standard/
 */
export async function createPaymentLink(
  params: CreatePaymentLinkParams
): Promise<PaymentLinkResult> {
  const { orderNo, amountInRupees, phone, expiryMinutes = 15, description } = params;
  const amountInPaise = Math.round(amountInRupees * 100);
  const expireBy = Math.floor(Date.now() / 1000) + expiryMinutes * 60;

  // In test/mock mode if keys are placeholder
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId || keyId.startsWith("rzp_test_mock")) {
    logger.info({ orderNo, amountInRupees }, "Using mock Razorpay payment link (mock keys detected)");
    return {
      linkId: `plink_mock_${orderNo}`,
      shortUrl: `https://rzp.io/i/mock-${orderNo}`,
      amountInPaise,
      expireBy,
    };
  }

  const endpoint = `${RAZORPAY_API_BASE}/payment_links`;

  const payload: Record<string, unknown> = {
    amount: amountInPaise,
    currency: "INR",
    accept_partial: false,
    reference_id: orderNo,
    description: description || `Payment for Order ${orderNo}`,
    expire_by: expireBy,
    customer: phone
      ? {
          contact: phone,
        }
      : undefined,
    notify: {
      sms: false,
      email: false,
    },
    reminder_enable: false,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok || !data.short_url) {
    logger.error({ status: response.status, data }, "Failed to create Razorpay payment link");
    throw new Error(data.error?.description || "Failed to create Razorpay payment link");
  }

  return {
    linkId: data.id,
    shortUrl: data.short_url,
    amountInPaise: data.amount,
    expireBy: data.expire_by,
  };
}

/**
 * Verifies the X-Razorpay-Signature header against the raw request body.
 * Reference: https://razorpay.com/docs/webhooks/validate-test/
 */
export function verifyRazorpaySignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  webhookSecret: string | undefined
): boolean {
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  const expectedHash = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedHash, "utf8");
  const actualBuffer = Buffer.from(signatureHeader.trim(), "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Initiates a full or partial refund for a Razorpay payment.
 * Reference: https://razorpay.com/docs/api/payments/refunds/create/
 */
export async function refundPayment(
  paymentId: string,
  amountInRupees?: number,
  notes?: Record<string, string>
): Promise<RazorpayRefundResult> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId || keyId.startsWith("rzp_test_mock")) {
    logger.info({ paymentId, amountInRupees }, "Mock refund processed (mock keys detected)");
    return {
      refundId: `rfnd_mock_${Date.now()}`,
      paymentId,
      amountInPaise: amountInRupees ? Math.round(amountInRupees * 100) : 0,
      status: "processed",
    };
  }

  const endpoint = `${RAZORPAY_API_BASE}/payments/${paymentId}/refund`;
  const payload: Record<string, unknown> = {};

  if (amountInRupees && amountInRupees > 0) {
    payload.amount = Math.round(amountInRupees * 100);
  }
  if (notes) {
    payload.notes = notes;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok || !data.id) {
    logger.error({ status: response.status, data }, "Razorpay refund request failed");
    throw new Error(data.error?.description || "Razorpay refund failed");
  }

  return {
    refundId: data.id,
    paymentId: data.payment_id,
    amountInPaise: data.amount,
    status: data.status,
  };
}

/**
 * Fetches current payment details directly from Razorpay for reconciliation.
 */
export async function fetchRazorpayPayment(paymentId: string): Promise<Record<string, unknown>> {
  const endpoint = `${RAZORPAY_API_BASE}/payments/${paymentId}`;
  const response = await fetch(endpoint, {
    headers: { Authorization: getBasicAuthHeader() },
  });
  return response.json();
}
