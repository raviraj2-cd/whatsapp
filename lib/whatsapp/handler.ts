import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import User, { IUser } from "@/models/User";
import { sendText } from "./client";

export interface ParsedInboundMessage {
  fromPhone: string;
  waMessageId: string;
  timestamp: string;
  type: "text" | "button_reply" | "list_reply" | "flow_reply" | "other";
  rawType: string;
  text?: string;
  buttonReply?: { id: string; title: string };
  listReply?: { id: string; title: string; description?: string };
  flowReply?: {
    rawJson: string;
    parsedData: Record<string, unknown> | null;
  };
  rawPayload: Record<string, unknown>;
}

/**
 * Checks for opt-out / opt-in standard keywords.
 * Returns true if the message was handled as an opt-in/opt-out command.
 */
export async function handleOptKeywords(
  user: IUser,
  text: string
): Promise<boolean> {
  const trimmed = text.trim().toLowerCase();

  // 1. Opt-out keywords
  if (["stop", "unsubscribe", "cancel", "optout"].includes(trimmed)) {
    logger.info({ phone: user.phone }, "User triggered opt-out keyword");
    user.optIn = false;
    user.optOutAt = new Date();
    await user.save();

    await sendText(
      user.phone,
      "You have unsubscribed from daily food updates. You will not receive automatic daily menus. Reply START anytime to re-subscribe."
    );
    return true;
  }

  // 2. Opt-in re-subscription keywords
  if (["start", "subscribe", "unstop"].includes(trimmed)) {
    logger.info({ phone: user.phone }, "User triggered opt-in keyword");
    user.optIn = true;
    user.optInAt = new Date();
    await user.save();

    await sendText(
      user.phone,
      "Welcome back! You have re-subscribed to daily food updates."
    );
    return true;
  }

  return false;
}

/**
 * Stub handler for inbound WhatsApp messages (to be wired into bot state machine in Stage 3).
 */
export async function handleInboundMessage(message: ParsedInboundMessage): Promise<void> {
  await connectDB();

  // Find or create customer user
  let user = await User.findOne({ phone: message.fromPhone });
  if (!user) {
    user = await User.create({
      phone: message.fromPhone,
      optIn: true,
      optInAt: new Date(),
    });
    logger.info({ phone: user.phone }, "Created new customer user from inbound message");
  }

  user.lastReplyAt = new Date();
  await user.save();

  // Handle opt-out / opt-in if plain text
  if (message.type === "text" && message.text) {
    const wasOptCommand = await handleOptKeywords(user, message.text);
    if (wasOptCommand) {
      return;
    }
  }

  logger.info(
    {
      type: message.type,
      from: message.fromPhone,
      id: message.waMessageId,
      preview: message.text || message.buttonReply?.id || message.listReply?.id,
    },
    "Inbound WhatsApp message received (handing off to bot engine)"
  );

  const { processInboundCustomerMessage } = await import("@/lib/bot/executor");
  await processInboundCustomerMessage(message.fromPhone, {
    type: message.type,
    text: message.text,
    buttonReply: message.buttonReply,
    listReply: message.listReply,
    flowReply: message.flowReply,
  });
}
