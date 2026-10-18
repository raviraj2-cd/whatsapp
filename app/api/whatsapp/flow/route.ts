import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isPastCutoff, recalculateCart } from "@/lib/bot/machine";
import { MenuItemCatalogItem } from "@/lib/bot/types";
import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import { decryptFlowRequest, encryptFlowResponse } from "@/lib/whatsapp/flow-crypto";
import MenuItem from "@/models/MenuItem";
import Order from "@/models/Order";
import Session from "@/models/Session";
import Settings from "@/models/Settings";

// 30-second in-memory menu cache to keep Flow endpoint responses ultra-fast
let menuCache: { expiresAt: number; items: MenuItemCatalogItem[] } | null = null;

async function getCachedAvailableMenu(): Promise<MenuItemCatalogItem[]> {
  const now = Date.now();
  if (menuCache && menuCache.expiresAt > now) {
    return menuCache.items;
  }
  await connectDB();
  const raw = await MenuItem.find({ available: true }).sort({ sortOrder: 1 }).lean();
  const items = raw.map((m) => ({
    id: m._id.toString(),
    name: m.name,
    price: m.price,
    category: m.category,
    available: m.available,
    description: m.description,
  }));
  menuCache = { expiresAt: now + 30000, items };
  return items;
}

function getPrivateKey(): string {
  if (process.env.FLOW_PRIVATE_KEY_PEM && process.env.FLOW_PRIVATE_KEY_PEM.length > 50) {
    return process.env.FLOW_PRIVATE_KEY_PEM.replace(/\\n/g, "\n");
  }
  const localFile = path.join(process.cwd(), "flows", "flow_private_key.pem");
  if (fs.existsSync(localFile)) {
    return fs.readFileSync(localFile, "utf8");
  }
  throw new Error("FLOW_PRIVATE_KEY_PEM not found in environment or flows/ directory");
}

export const dynamic = "force-dynamic";

/**
 * Meta WhatsApp Flow Data Exchange Endpoint
 * Handshake and screen transition handler.
 */
export async function POST(request: NextRequest) {
  let aesKey: Buffer | null = null;
  let initialVector: Buffer | null = null;

  try {
    const body = await request.json();
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = body;

    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      return new NextResponse("Invalid encrypted payload", { status: 400 });
    }

    const privateKeyPem = getPrivateKey();
    const passphrase = process.env.FLOW_PASSPHRASE;

    // Decrypt incoming request
    const decrypted = decryptFlowRequest<{
      version?: string;
      action: string;
      screen?: string;
      flow_token?: string;
      data?: Record<string, unknown>;
    }>(
      encrypted_flow_data,
      encrypted_aes_key,
      initial_vector,
      privateKeyPem,
      passphrase
    );

    aesKey = decrypted.aesKey;
    initialVector = decrypted.initialVector;

    const payload = decrypted.decryptedBody;
    const action = payload.action;
    const flowToken = payload.flow_token;
    const currentScreen = payload.screen;
    const clientData = payload.data || {};

    // Never log personal customer data: only log action and flow token hash
    logger.info({ action, screen: currentScreen, token: flowToken ? flowToken.slice(0, 14) + "..." : undefined }, "Flow request received");

    // 1. Health check / Ping action from Meta Flow Builder
    if (action === "ping") {
      const pingResponse = {
        version: "3.0",
        data: {
          status: "active",
        },
      };
      const encryptedResponse = encryptFlowResponse(pingResponse, aesKey, initialVector);
      return new NextResponse(encryptedResponse, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Connect database
    await connectDB();

    // 2. Validate Session by flow_token
    const session = await Session.findOne({
      $or: [{ flowToken }, { "tempData.flowToken": flowToken }],
    });

    const now = new Date();
    if (!session || session.expiresAt < now) {
      const expiredResponse = {
        version: "3.0",
        screen: "ERROR",
        data: {
          error_message: "Your ordering session has expired. Please send 'menu' in chat to start a new order.",
        },
      };
      const enc = encryptFlowResponse(expiredResponse, aesKey, initialVector);
      return new NextResponse(enc, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Load Settings
    const settings = await Settings.findOne({ key: "app_settings" }).lean();
    const cutoffTime = settings?.cutoffTime || "13:00";
    const deliveryCharge = settings?.deliveryCharge ?? 30;

    let responsePayload: Record<string, unknown>;

    // 3. Screen Routing
    const flowName = session.flowName || "";

    if (flowName.includes("custom") || currentScreen === "FORM") {
      // ---------------- Custom Order Flow ----------------
      const pastCutoff = isPastCutoff(now, cutoffTime);
      const minDate = pastCutoff
        ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        : now.toISOString().split("T")[0];

      responsePayload = {
        version: "3.0",
        screen: "FORM",
        data: {
          min_date: minDate,
          cutoff_note: `Kitchen cutoff for same-day lunch is ${cutoffTime}.`,
        },
      };
    } else if (flowName.includes("view") || currentScreen === "ORDER") {
      // ---------------- View Order Flow ----------------
      const orderNo = session.tempData?.orderNo as string;
      const order = await Order.findOne({
        $or: [{ orderNo }, { userId: session.userId }],
      }).sort({ createdAt: -1 });

      if (order) {
        responsePayload = {
          version: "3.0",
          screen: "ORDER",
          data: {
            order_number: order.orderNo,
            order_status: order.status.replace(/_/g, " ").toUpperCase(),
            items_summary: order.items.map((i) => `${i.quantity}x ${i.name}`).join("\n"),
            total_amount: `₹${order.total}`,
            delivery_details:
              order.deliveryType === "delivery"
                ? `Delivery: ${order.address || "Address confirmed on file"}`
                : "Self Pickup at Kitchen",
          },
        };
      } else {
        responsePayload = {
          version: "3.0",
          screen: "ORDER",
          data: {
            order_number: "N/A",
            order_status: "NO ACTIVE ORDER",
            items_summary: "No pending or active orders found.",
            total_amount: "₹0",
            delivery_details: "N/A",
          },
        };
      }
    } else {
      // ---------------- Menu Order Flow (Default) ----------------
      const menuCatalog = await getCachedAvailableMenu();

      if (action === "data_exchange" && currentScreen === "MENU") {
        // User clicked "Proceed to Summary" from MENU screen
        const selectedIds = Array.isArray(clientData.selected_item_ids)
          ? clientData.selected_item_ids
          : [];

        // Server recalculates totals strictly from database
        const recalculated = recalculateCart(
          selectedIds.map((id: string) => ({ id, quantity: 1 })),
          menuCatalog,
          deliveryCharge
        );

        // Store recalculated cart in session
        session.tempData = {
          ...session.tempData,
          cart: recalculated.cart,
          subtotal: recalculated.subtotal,
          deliveryCharge: recalculated.deliveryCharge,
          total: recalculated.total,
        };
        await session.save();

        const summaryItems = recalculated.cart
          .map((i) => `${i.quantity}x ${i.name} (₹${i.total})`)
          .join(", ");

        responsePayload = {
          version: "3.0",
          screen: "SUMMARY",
          data: {
            order_summary_text: `Selected: ${summaryItems || "None"} | Subtotal: ₹${recalculated.subtotal} | Total: ₹${recalculated.total}`,
            delivery_charge_text: `Delivery: ₹${recalculated.deliveryCharge} (Waived for pickup)`,
          },
        };
      } else {
        // action === "INIT" or "BACK" -> Display MENU screen
        const formattedMenuItems = menuCatalog.map((item) => ({
          id: item.id,
          title: `${item.name} - ₹${item.price}`,
          description: item.description || item.category,
        }));

        responsePayload = {
          version: "3.0",
          screen: "MENU",
          data: {
            menu_items: formattedMenuItems,
          },
        };
      }
    }

    const encryptedResponse = encryptFlowResponse(responsePayload, aesKey, initialVector);
    return new NextResponse(encryptedResponse, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    // Meta documentation specifies HTTP 421 (Misdirected Request) on Flow Decryption Failures
    logger.warn({ error }, "Returning HTTP 421 on Flow decryption failure");
    return new NextResponse("Misdirected Request", { status: 421 });
  }
}
