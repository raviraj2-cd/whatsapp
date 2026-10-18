import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import MessageLog from "@/models/MessageLog";
import User from "@/models/User";

const GRAPH_API_BASE = "https://graph.facebook.com";

interface MetaMessageResponse {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface ButtonItem {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export interface TemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: string;
  index?: number;
  parameters: Array<Record<string, unknown>>;
}

/**
 * Executes a WhatsApp Graph API request with exponential backoff on transient errors (5xx / network).
 */
async function postWhatsAppGraph(
  payload: Record<string, unknown>,
  maxRetries = 3
): Promise<MetaMessageResponse> {
  const version = process.env.WHATSAPP_API_VERSION || "v21.0";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneId || !token) {
    throw new Error(
      "Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in environment"
    );
  }

  const endpoint = `${GRAPH_API_BASE}/${version}/${phoneId}/messages`;

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    try {
      attempt++;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as MetaMessageResponse;

      if (!res.ok || data.error) {
        const errorMsg = data.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        const isTransient = res.status >= 500 || res.status === 429;

        logger.warn(
          { attempt, status: res.status, error: data.error, to: payload.to },
          "Meta Graph API error response"
        );

        if (isTransient && attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 250; // 500ms, 1000ms...
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        throw new Error(`Meta API error: ${errorMsg}`);
      }

      return data;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= maxRetries) {
        break;
      }
      const delayMs = Math.pow(2, attempt) * 250;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error("Failed to send WhatsApp message after retries");
}

/**
 * Logs an outbound message record to MongoDB messageLogs
 */
async function logOutboundMessage(
  toPhone: string,
  type: string,
  payload: Record<string, unknown>,
  waMessageId?: string,
  error?: string
) {
  try {
    await connectDB();
    const user = await User.findOne({ phone: toPhone }).select("_id").lean();

    await MessageLog.create({
      direction: "outbound",
      waMessageId,
      userId: user?._id,
      type,
      payload,
      status: error ? "failed" : "sent",
      error,
    });
  } catch (err) {
    logger.error({ err, toPhone }, "Failed to persist outbound messageLog to database");
  }
}

/**
 * 1. Send Plain Text Message
 */
export async function sendText(to: string, text: string): Promise<string | undefined> {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  };

  try {
    const res = await postWhatsAppGraph(payload);
    const waId = res.messages?.[0]?.id;
    await logOutboundMessage(to, "text", payload, waId);
    return waId;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logOutboundMessage(to, "text", payload, undefined, errorMsg);
    throw err;
  }
}

/**
 * 2. Send Approved Template Message
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode = "en",
  components?: TemplateComponent[]
): Promise<string | undefined> {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components || [],
    },
  };

  try {
    const res = await postWhatsAppGraph(payload);
    const waId = res.messages?.[0]?.id;
    await logOutboundMessage(to, "template", payload, waId);
    return waId;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logOutboundMessage(to, "template", payload, undefined, errorMsg);
    throw err;
  }
}

/**
 * 3. Send Quick Reply Interactive Buttons (Max 3)
 */
export async function sendButtons(
  to: string,
  bodyText: string,
  buttons: ButtonItem[]
): Promise<string | undefined> {
  if (buttons.length > 3) {
    throw new Error("Meta allows a maximum of 3 buttons in interactive button messages");
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) }, // Meta enforces max 20 chars
        })),
      },
    },
  };

  try {
    const res = await postWhatsAppGraph(payload);
    const waId = res.messages?.[0]?.id;
    await logOutboundMessage(to, "interactive_button", payload, waId);
    return waId;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logOutboundMessage(to, "interactive_button", payload, undefined, errorMsg);
    throw err;
  }
}

/**
 * 4. Send Interactive List Message (Max 10 rows per section)
 */
export async function sendList(
  to: string,
  bodyText: string,
  buttonText: string,
  sections: ListSection[]
): Promise<string | undefined> {
  for (const section of sections) {
    if (section.rows.length > 10) {
      throw new Error(
        `Meta allows a maximum of 10 rows per section. Section "${section.title}" has ${section.rows.length}.`
      );
    }
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonText.slice(0, 20),
        sections: sections.map((s) => ({
          title: s.title.slice(0, 24),
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title.slice(0, 24),
            description: r.description ? r.description.slice(0, 72) : undefined,
          })),
        })),
      },
    },
  };

  try {
    const res = await postWhatsAppGraph(payload);
    const waId = res.messages?.[0]?.id;
    await logOutboundMessage(to, "interactive_list", payload, waId);
    return waId;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logOutboundMessage(to, "interactive_list", payload, undefined, errorMsg);
    throw err;
  }
}

/**
 * 5. Send WhatsApp Flow Trigger Message
 * Reference: https://developers.facebook.com/docs/whatsapp/flows/guides/sendingflows/
 */
export async function sendFlowMessage(
  to: string,
  bodyText: string,
  flowId: string,
  flowToken: string,
  screen: string,
  ctaText = "Open Menu",
  flowActionPayload?: Record<string, unknown>
): Promise<string | undefined> {
  // TODO: Verify Meta Flows version 3 payload requirements with official doc:
  // https://developers.facebook.com/docs/whatsapp/flows/guides/sendingflows/
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: bodyText },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: flowToken,
          flow_id: flowId,
          flow_cta: ctaText.slice(0, 20),
          flow_action: "navigate",
          flow_action_payload: {
            screen,
            data: flowActionPayload || {},
          },
        },
      },
    },
  };

  try {
    const res = await postWhatsAppGraph(payload);
    const waId = res.messages?.[0]?.id;
    await logOutboundMessage(to, "interactive_flow", payload, waId);
    return waId;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logOutboundMessage(to, "interactive_flow", payload, undefined, errorMsg);
    throw err;
  }
}
