import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { computeMetaSignature } from "../lib/whatsapp/signature";
import { encryptFlowRequestForTest } from "../lib/whatsapp/flow-crypto";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const META_SECRET = process.env.META_APP_SECRET || "mock_meta_app_secret";
const RZP_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "mockWebhookSecret";

async function postSignedMetaWebhook(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  const signature = computeMetaSignature(rawBody, META_SECRET);

  console.log(`\n📤 Sending signed webhook to ${BASE_URL}/api/whatsapp/webhook...`);
  const res = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": signature,
    },
    body: rawBody,
  });

  const text = await res.text();
  console.log(`📥 Response [${res.status}]: ${text}`);
}

async function simulate() {
  console.log("=================================================");
  console.log("   FoodOps WhatsApp & Flow Simulator (No Phone)");
  console.log("=================================================");

  const phone = "+919876543210";
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // 1. Simulate "Hi / Need Food" Inbound Text
  console.log("\n[Step 1] Simulating customer sending 'hi'...");
  await postSignedMetaWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "phone_123" },
              messages: [
                {
                  from: phone,
                  id: `wamid.mock.${Date.now()}`,
                  timestamp,
                  type: "text",
                  text: { body: "hi" },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  // 2. Simulate Customer Tapping "Yes, I'm hungry" Button
  console.log("\n[Step 2] Simulating customer tapping [Yes, I'm hungry] button...");
  await postSignedMetaWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "phone_123" },
              messages: [
                {
                  from: phone,
                  id: `wamid.mock.${Date.now() + 1}`,
                  timestamp,
                  type: "interactive",
                  interactive: {
                    type: "button_reply",
                    button_reply: { id: "BTN_FOOD_YES", title: "Yes, I'm hungry" },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  // 3. Simulate WhatsApp Flow Data Exchange (ping)
  console.log("\n[Step 3] Simulating encrypted Flow call (/api/whatsapp/flow ping)...");
  const publicKeyPath = path.join(process.cwd(), "flows", "flow_public_key.pem");
  if (fs.existsSync(publicKeyPath)) {
    const publicKeyPem = fs.readFileSync(publicKeyPath, "utf8");
    const flowPayload = { version: "3.0", action: "ping" };
    const encrypted = encryptFlowRequestForTest(flowPayload, publicKeyPem);

    const flowRes = await fetch(`${BASE_URL}/api/whatsapp/flow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(encrypted),
    });

    const flowResText = await flowRes.text();
    console.log(`📥 Flow Endpoint Response [${flowRes.status}]: ${flowResText.slice(0, 40)}... (Base64 encrypted)`);
  }

  // 4. Simulate Razorpay Payment Webhook (payment_link.paid)
  console.log("\n[Step 4] Simulating Razorpay payment_link.paid webhook...");
  const sampleOrderNo = "ORD-20261015-001";
  const rzpPayload = JSON.stringify({
    entity: "event",
    event: "payment_link.paid",
    payload: {
      payment_link: {
        entity: {
          id: `plink_sim_${Date.now()}`,
          reference_id: sampleOrderNo,
          amount_paid: 67000,
          status: "paid",
        },
      },
      payment: {
        entity: {
          id: `pay_sim_${Date.now()}`,
          amount: 67000,
          currency: "INR",
          status: "captured",
          contact: phone,
        },
      },
    },
  });

  const rzpSig = crypto
    .createHmac("sha256", RZP_SECRET)
    .update(rzpPayload)
    .digest("hex");

  const rzpRes = await fetch(`${BASE_URL}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": rzpSig,
    },
    body: rzpPayload,
  });

  const rzpResText = await rzpRes.text();
  console.log(`📥 Razorpay Webhook Response [${rzpRes.status}]: ${rzpResText}`);

  console.log("\n✔ Simulation run finished! Check your console/dashboard to observe updates.");
}

simulate().catch((err) => {
  console.error("Simulation failed:", err);
});
