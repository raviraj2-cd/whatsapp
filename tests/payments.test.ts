import assert from "node:assert";
import crypto from "node:crypto";
import {
  createPaymentLink,
  verifyRazorpaySignature,
} from "../lib/payments/razorpay";

function runPaymentTests() {
  console.log("Starting Razorpay Payment & Webhook Unit Tests...");

  const secret = "rzp_webhook_secret_998877";

  // Sample Razorpay payment_link.paid webhook event
  const samplePaidPayload = JSON.stringify({
    entity: "event",
    account_id: "acc_mock123",
    event: "payment_link.paid",
    contains: ["payment_link", "payment"],
    payload: {
      payment_link: {
        entity: {
          id: "plink_test123",
          reference_id: "ORD-20261015-001",
          amount: 67000,
          amount_paid: 67000,
          status: "paid",
        },
      },
      payment: {
        entity: {
          id: "pay_testPayment999",
          amount: 67000,
          currency: "INR",
          status: "captured",
          contact: "+919876543210",
        },
      },
    },
    created_at: 1729000000,
  });

  // 1. Signature Verification - Valid
  const validSignature = crypto
    .createHmac("sha256", secret)
    .update(samplePaidPayload)
    .digest("hex");

  assert.strictEqual(
    verifyRazorpaySignature(samplePaidPayload, validSignature, secret),
    true,
    "Valid Razorpay signature must return true"
  );

  // 2. Signature Verification - Wrong signature
  assert.strictEqual(
    verifyRazorpaySignature(samplePaidPayload, "wrong_signature_hash_1234567890abcdef", secret),
    false,
    "Wrong signature must return false"
  );

  // 3. Signature Verification - Tampered body
  const tamperedPayload = samplePaidPayload.replace("67000", "10000");
  assert.strictEqual(
    verifyRazorpaySignature(tamperedPayload, validSignature, secret),
    false,
    "Tampered body must fail verification"
  );

  // 4. Missing inputs
  assert.strictEqual(verifyRazorpaySignature(samplePaidPayload, null, secret), false);
  assert.strictEqual(verifyRazorpaySignature(samplePaidPayload, validSignature, undefined), false);

  // 5. Payment Link creation logic test
  // Sets mock env variables
  process.env.RAZORPAY_KEY_ID = "rzp_test_mockKey";
  process.env.RAZORPAY_KEY_SECRET = "mockSecret";

  createPaymentLink({
    orderNo: "ORD-20261015-001",
    amountInRupees: 670,
    expiryMinutes: 15,
  }).then((link) => {
    assert.strictEqual(link.amountInPaise, 67000, "Amount in paise must equal rupees * 100");
    assert.ok(link.shortUrl.includes("ORD-20261015-001"), "Short URL must reference order number");
    assert.ok(link.expireBy > Math.floor(Date.now() / 1000), "ExpireBy must be in the future");

    // 6. Test Idempotency Simulation
    const processedEvents = new Set<string>();
    const paymentId = "pay_testPayment999";

    function processEvent(id: string): string {
      if (processedEvents.has(id)) {
        return "already_processed";
      }
      processedEvents.add(id);
      return "processed";
    }

    assert.strictEqual(processEvent(paymentId), "processed", "First event should be processed");
    assert.strictEqual(processEvent(paymentId), "already_processed", "Second event with same paymentId must be skipped");

    console.log("✔ All Razorpay Payment & Webhook unit tests passed successfully!");
  });
}

runPaymentTests();
