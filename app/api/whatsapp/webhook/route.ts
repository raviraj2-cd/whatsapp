import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import { handleInboundMessage, ParsedInboundMessage } from "@/lib/whatsapp/handler";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import MessageLog from "@/models/MessageLog";
import User from "@/models/User";

/**
 * 1. Meta Webhook Verification Handshake (GET)
 * Meta calls this when you configure your Webhook URL in Meta App Dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
    logger.info("WhatsApp webhook verification successful");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  logger.warn({ mode, tokenReceived: Boolean(token) }, "WhatsApp webhook verification failed");
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Helper to process the webhook payload in background without blocking Meta's 200 OK.
 */
async function processWebhookPayloadAsync(rawBody: string) {
  try {
    const data = JSON.parse(rawBody);

    if (data.object !== "whatsapp_business_account" || !Array.isArray(data.entry)) {
      return;
    }

    await connectDB();

    for (const entry of data.entry) {
      if (!Array.isArray(entry.changes)) continue;

      for (const change of entry.changes) {
        if (change.field !== "messages" || !change.value) continue;

        const val = change.value;

        // 1. Handle message status updates (sent, delivered, read, failed)
        if (Array.isArray(val.statuses)) {
          for (const st of val.statuses) {
            const waMessageId = st.id;
            const newStatus = st.status; // sent | delivered | read | failed
            const errorDetails = st.errors ? JSON.stringify(st.errors) : undefined;

            const updated = await MessageLog.findOneAndUpdate(
              { waMessageId },
              {
                status: newStatus,
                ...(errorDetails ? { error: errorDetails } : {}),
              },
              { new: true }
            );

            if (updated) {
              logger.debug({ waMessageId, newStatus }, "Updated messageLog status");
            }
          }
        }

        // 2. Handle incoming customer messages
        if (Array.isArray(val.messages)) {
          for (const msg of val.messages) {
            const waMessageId = msg.id;
            const fromPhone = msg.from;
            const rawType = msg.type;
            const timestamp = msg.timestamp;

            // Idempotency: skip if already logged
            const existing = await MessageLog.findOne({ waMessageId });
            if (existing) {
              logger.info({ waMessageId }, "Skipping duplicate incoming message (idempotency)");
              continue;
            }

            // Ensure User exists for reference
            let user = await User.findOne({ phone: fromPhone });
            if (!user) {
              user = await User.create({
                phone: fromPhone,
                optIn: true,
                optInAt: new Date(),
              });
            }

            const parsedMessage: ParsedInboundMessage = {
              fromPhone,
              waMessageId,
              timestamp,
              type: "other",
              rawType,
              rawPayload: msg,
            };

            // Parse specific message types
            if (rawType === "text" && msg.text) {
              parsedMessage.type = "text";
              parsedMessage.text = msg.text.body;
            } else if (rawType === "interactive" && msg.interactive) {
              const interactiveType = msg.interactive.type;

              if (interactiveType === "button_reply") {
                parsedMessage.type = "button_reply";
                parsedMessage.buttonReply = {
                  id: msg.interactive.button_reply?.id || "",
                  title: msg.interactive.button_reply?.title || "",
                };
              } else if (interactiveType === "list_reply") {
                parsedMessage.type = "list_reply";
                parsedMessage.listReply = {
                  id: msg.interactive.list_reply?.id || "",
                  title: msg.interactive.list_reply?.title || "",
                  description: msg.interactive.list_reply?.description,
                };
              } else if (interactiveType === "nfm_reply") {
                // WhatsApp Flow response
                parsedMessage.type = "flow_reply";
                const responseJsonRaw = msg.interactive.nfm_reply?.response_json || "{}";
                let parsedFlowData: Record<string, unknown> | null = null;
                try {
                  parsedFlowData = JSON.parse(responseJsonRaw);
                } catch (e) {
                  logger.warn({ err: e, responseJsonRaw }, "Failed to parse nfm_reply response_json");
                }
                parsedMessage.flowReply = {
                  rawJson: responseJsonRaw,
                  parsedData: parsedFlowData,
                };
              }
            }

            // Store message log
            await MessageLog.create({
              direction: "inbound",
              waMessageId,
              userId: user._id,
              type: parsedMessage.type,
              payload: msg,
              status: "received",
            });

            // Dispatch to message handler
            await handleInboundMessage(parsedMessage);
          }
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Unhandled error during async webhook processing");
  }
}

/**
 * 2. Meta Webhook Event Intake (POST)
 * Verifies X-Hub-Signature-256 and returns HTTP 200 immediately.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    const appSecret = process.env.META_APP_SECRET;

    // Verify Meta X-Hub-Signature-256
    const isValid = verifyMetaSignature(rawBody, signature, appSecret);
    if (!isValid) {
      logger.warn({ signaturePresent: Boolean(signature) }, "Invalid Meta webhook signature. Rejecting 401.");
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Process asynchronously without blocking response
    setImmediate(() => {
      processWebhookPayloadAsync(rawBody).catch((err) => {
        logger.error({ err }, "Background webhook execution failed");
      });
    });

    // Fast 200 acknowledge
    return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
  } catch (error) {
    logger.error({ error }, "Error receiving webhook request");
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
