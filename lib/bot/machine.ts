import { BotMessages } from "./messages";
import {
  BotAction,
  BotContext,
  BotIncomingMessage,
  BotSessionData,
  BotTransitionResult,
  MenuItemCatalogItem,
} from "./types";

/**
 * Checks if current time is at or past cutoff time (e.g. "13:00")
 */
export function isPastCutoff(now: Date = new Date(), cutoffTime = "13:00"): boolean {
  const [cutoffHour, cutoffMinute] = cutoffTime.split(":").map(Number);
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  if (currentHour > cutoffHour) return true;
  if (currentHour === cutoffHour && currentMinute >= cutoffMinute) return true;
  return false;
}

/**
 * Recalculates cart items against the authoritative database catalog.
 * Never trusts prices or line-item totals from client / flow payloads.
 */
export function recalculateCart(
  rawItems: Array<{ id?: string; menuItemId?: string; quantity?: number }>,
  catalog: MenuItemCatalogItem[] = [],
  deliveryCharge = 30
): {
  cart: Array<{
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    total: number;
  }>;
  subtotal: number;
  deliveryCharge: number;
  total: number;
} {
  const catalogMap = new Map<string, MenuItemCatalogItem>();
  for (const item of catalog) {
    catalogMap.set(item.id.toString(), item);
  }

  const validItems: Array<{
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    total: number;
  }> = [];

  let subtotal = 0;

  for (const raw of rawItems) {
    const itemId = (raw.menuItemId || raw.id || "").toString();
    const catalogItem = catalogMap.get(itemId);
    const quantity = Math.max(1, Math.min(99, Math.floor(raw.quantity || 1)));

    if (catalogItem && catalogItem.available) {
      const lineTotal = catalogItem.price * quantity;
      subtotal += lineTotal;
      validItems.push({
        menuItemId: catalogItem.id,
        name: catalogItem.name,
        price: catalogItem.price,
        quantity,
        total: lineTotal,
      });
    }
  }

  const finalDeliveryCharge = validItems.length > 0 ? deliveryCharge : 0;
  const total = subtotal + finalDeliveryCharge;

  return {
    cart: validItems,
    subtotal,
    deliveryCharge: finalDeliveryCharge,
    total,
  };
}

/**
 * Pure state machine transition function.
 * (session, incomingMessage, context) -> { actions, nextSession }
 */
export function handleBotTransition(
  session: BotSessionData,
  message: BotIncomingMessage,
  context: BotContext = {}
): BotTransitionResult {
  const now = context.now || new Date();
  const sessionTimeoutMin = context.sessionTimeoutMin || 30;
  const cutoffTime = context.cutoffTime || "13:00";
  const deliveryCharge = context.deliveryCharge ?? 30;
  const flowIds = context.flowIds || {};
  const menuCatalog = context.menuCatalog || [];

  const nextExpiresAt = new Date(now.getTime() + sessionTimeoutMin * 60 * 1000);

  // 1. Session Expiry Check
  if (session.step !== "IDLE" && session.expiresAt && session.expiresAt < now) {
    return {
      actions: [{ type: "SEND_TEXT", text: BotMessages.sessionExpired }],
      nextSession: {
        ...session,
        step: "IDLE",
        tempData: {},
        expiresAt: nextExpiresAt,
      },
    };
  }

  const incomingText = (message.text || "").trim().toLowerCase();

  // 2. Universal Cancel / Restart Keywords
  if (["cancel", "restart", "reset"].includes(incomingText)) {
    return {
      actions: [{ type: "SEND_TEXT", text: BotMessages.orderCancelled }],
      nextSession: {
        ...session,
        step: "IDLE",
        tempData: {},
        expiresAt: nextExpiresAt,
      },
    };
  }

  // 3. State-specific Handling
  switch (session.step) {
    case "IDLE": {
      // Check cutoff before initiating new order
      if (isPastCutoff(now, cutoffTime)) {
        return {
          actions: [{ type: "SEND_TEXT", text: BotMessages.cutoffTimePassed(cutoffTime) }],
          nextSession: { ...session, step: "IDLE", expiresAt: nextExpiresAt },
        };
      }

      return {
        actions: [
          {
            type: "SEND_BUTTONS",
            bodyText: BotMessages.dailyAskPrompt,
            buttons: BotMessages.dailyAskButtons,
          },
        ],
        nextSession: {
          ...session,
          step: "ASKED",
          tempData: { lastAskedAt: now.toISOString() },
          expiresAt: nextExpiresAt,
        },
      };
    }

    case "ASKED": {
      const isYes =
        message.buttonReply?.id === "BTN_FOOD_YES" ||
        /^(yes|y|yeah|hungry|order|1)$/i.test(incomingText);
      const isNo =
        message.buttonReply?.id === "BTN_FOOD_NO" ||
        /^(no|n|nope|not today|2)$/i.test(incomingText);

      if (isYes) {
        if (isPastCutoff(now, cutoffTime)) {
          return {
            actions: [{ type: "SEND_TEXT", text: BotMessages.cutoffTimePassed(cutoffTime) }],
            nextSession: { ...session, step: "IDLE", tempData: {}, expiresAt: nextExpiresAt },
          };
        }

        return {
          actions: [
            {
              type: "SEND_BUTTONS",
              bodyText: BotMessages.chooseOrderTypePrompt,
              buttons: BotMessages.chooseOrderTypeButtons,
            },
          ],
          nextSession: {
            ...session,
            step: "CHOOSE_TYPE",
            expiresAt: nextExpiresAt,
          },
        };
      }

      if (isNo) {
        const yyyymmdd = now.toISOString().split("T")[0];
        return {
          actions: [
            { type: "SEND_TEXT", text: BotMessages.foodDeclined },
            { type: "LOG_DECLINED", phone: session.phone, date: yyyymmdd },
          ],
          nextSession: {
            ...session,
            step: "IDLE",
            tempData: {},
            expiresAt: nextExpiresAt,
          },
        };
      }

      return {
        actions: [{ type: "SEND_TEXT", text: BotMessages.repromptAsked }],
        nextSession: { ...session, expiresAt: nextExpiresAt },
      };
    }

    case "CHOOSE_TYPE": {
      const isMenu =
        message.buttonReply?.id === "BTN_MENU_ORDER" ||
        /^(menu|menu order|1)$/i.test(incomingText);
      const isCustom =
        message.buttonReply?.id === "BTN_CUSTOM_ORDER" ||
        /^(custom|customize|2)$/i.test(incomingText);
      const isFallbackList = incomingText === "list";

      if (isMenu) {
        const flowToken = `flw_menu_${session.phone}_${now.getTime()}`;
        const flowId = flowIds.menuOrder || "menu_order_flow";

        return {
          actions: [
            {
              type: "SEND_FLOW",
              flowId,
              flowToken,
              screen: "MENU_SCREEN",
              ctaText: BotMessages.menuFlowCta,
              bodyText: BotMessages.menuFlowPrompt,
              payload: { catalogCount: menuCatalog.length },
            },
          ],
          nextSession: {
            ...session,
            step: "MENU_FLOW",
            flowToken,
            flowName: "menu_order_flow",
            tempData: { ...session.tempData, orderType: "menu", flowToken },
            expiresAt: nextExpiresAt,
          },
        };
      }

      if (isCustom) {
        const flowToken = `flw_custom_${session.phone}_${now.getTime()}`;
        const flowId = flowIds.customOrder || "custom_order_flow";

        return {
          actions: [
            {
              type: "SEND_FLOW",
              flowId,
              flowToken,
              screen: "CUSTOM_FORM_SCREEN",
              ctaText: BotMessages.customFlowCta,
              bodyText: BotMessages.customFlowPrompt,
            },
          ],
          nextSession: {
            ...session,
            step: "CUSTOM_FLOW",
            flowToken,
            flowName: "custom_order_flow",
            tempData: { ...session.tempData, orderType: "custom", flowToken },
            expiresAt: nextExpiresAt,
          },
        };
      }

      // Graceful fallback to chat list if user requests 'list'
      if (isFallbackList && menuCatalog.length > 0) {
        const rows = menuCatalog.slice(0, 10).map((m) => ({
          id: `item_${m.id}`,
          title: m.name.slice(0, 24),
          description: `₹${m.price} - ${m.category}`.slice(0, 72),
        }));

        return {
          actions: [
            {
              type: "SEND_LIST",
              bodyText: BotMessages.fallbackMenuListHeader,
              buttonText: BotMessages.fallbackMenuListButton,
              sections: [{ title: "Today's Specials", rows }],
            },
          ],
          nextSession: {
            ...session,
            step: "MENU_FLOW",
            tempData: { ...session.tempData, orderType: "menu", fallbackActive: true },
            expiresAt: nextExpiresAt,
          },
        };
      }

      return {
        actions: [{ type: "SEND_TEXT", text: BotMessages.repromptChooseType }],
        nextSession: { ...session, expiresAt: nextExpiresAt },
      };
    }

    case "MENU_FLOW": {
      // 1. WhatsApp Flow completion result
      if (message.type === "flow_reply" && message.flowReply?.parsedData) {
        const rawItems = (message.flowReply.parsedData.items ||
          message.flowReply.parsedData.cart ||
          []) as Array<{ id?: string; menuItemId?: string; quantity?: number }>;

        const calculated = recalculateCart(rawItems, menuCatalog, deliveryCharge);

        if (calculated.cart.length === 0) {
          return {
            actions: [
              {
                type: "SEND_TEXT",
                text: "No valid or available items were selected. Please choose from our menu:",
              },
              {
                type: "SEND_BUTTONS",
                bodyText: BotMessages.chooseOrderTypePrompt,
                buttons: BotMessages.chooseOrderTypeButtons,
              },
            ],
            nextSession: { ...session, step: "CHOOSE_TYPE", expiresAt: nextExpiresAt },
          };
        }

        // Build itemized summary text
        const itemsSummary = calculated.cart
          .map((i) => `• ${i.quantity}x ${i.name} (₹${i.total})`)
          .join("\n");

        const summaryText = `${BotMessages.menuSummaryHeader}\n\n${itemsSummary}\n\nSubtotal: ₹${calculated.subtotal}\nDelivery: ₹${calculated.deliveryCharge}\n*Total Payable: ₹${calculated.total}*\n\nPlease tap confirm to place your order:`;

        return {
          actions: [
            {
              type: "SEND_BUTTONS",
              bodyText: summaryText,
              buttons: BotMessages.confirmOrderButtons,
            },
          ],
          nextSession: {
            ...session,
            step: "CONFIRM",
            tempData: {
              ...session.tempData,
              cart: calculated.cart,
              subtotal: calculated.subtotal,
              deliveryCharge: calculated.deliveryCharge,
              total: calculated.total,
            },
            expiresAt: nextExpiresAt,
          },
        };
      }

      // 2. Chat list fallback interaction
      if (message.type === "list_reply" && message.listReply) {
        const selectedId = message.listReply.id.replace("item_", "");
        const matched = menuCatalog.find((m) => m.id.toString() === selectedId);

        if (matched) {
          const calculated = recalculateCart([{ id: matched.id, quantity: 1 }], menuCatalog, deliveryCharge);
          const summaryText = `${BotMessages.menuSummaryHeader}\n\n• 1x ${matched.name} (₹${matched.price})\n\nSubtotal: ₹${calculated.subtotal}\nDelivery: ₹${calculated.deliveryCharge}\n*Total Payable: ₹${calculated.total}*`;

          return {
            actions: [
              {
                type: "SEND_BUTTONS",
                bodyText: summaryText,
                buttons: BotMessages.confirmOrderButtons,
              },
            ],
            nextSession: {
              ...session,
              step: "CONFIRM",
              tempData: {
                ...session.tempData,
                cart: calculated.cart,
                subtotal: calculated.subtotal,
                deliveryCharge: calculated.deliveryCharge,
                total: calculated.total,
              },
              expiresAt: nextExpiresAt,
            },
          };
        }
      }

      // If user is stuck and asks for list
      if (incomingText === "list") {
        const rows = menuCatalog.slice(0, 10).map((m) => ({
          id: `item_${m.id}`,
          title: m.name.slice(0, 24),
          description: `₹${m.price}`.slice(0, 72),
        }));

        return {
          actions: [
            {
              type: "SEND_LIST",
              bodyText: BotMessages.fallbackMenuListHeader,
              buttonText: BotMessages.fallbackMenuListButton,
              sections: [{ title: "Menu", rows }],
            },
          ],
          nextSession: { ...session, expiresAt: nextExpiresAt },
        };
      }

      return {
        actions: [{ type: "SEND_TEXT", text: BotMessages.repromptMenuFlow }],
        nextSession: { ...session, expiresAt: nextExpiresAt },
      };
    }

    case "CUSTOM_FLOW": {
      // 1. Flow submission
      if (message.type === "flow_reply" && message.flowReply?.parsedData) {
        const data = message.flowReply.parsedData;
        const description = String(data.description || data.dish || "Custom Meal Request");
        const dietary = data.dietary ? String(data.dietary) : undefined;
        const portion = data.portion ? String(data.portion) : undefined;

        return {
          actions: [
            { type: "SEND_TEXT", text: BotMessages.customOrderReceived },
            {
              type: "NOTIFY_ADMIN",
              title: "New Custom Order Awaiting Quote",
              details: { phone: session.phone, description, dietary, portion },
            },
          ],
          nextSession: {
            ...session,
            step: "AWAIT_QUOTE",
            tempData: {
              ...session.tempData,
              customRequest: { description, dietary, portion, rawInput: message.flowReply.rawJson },
            },
            expiresAt: nextExpiresAt,
          },
        };
      }

      // 2. Chat Step-by-Step Fallback
      const currentStep = session.tempData.customRequest?.step || 0;
      if (currentStep === 0 && incomingText.length > 0) {
        return {
          actions: [{ type: "SEND_TEXT", text: BotMessages.fallbackCustomStep2 }],
          nextSession: {
            ...session,
            step: "CUSTOM_FLOW",
            tempData: {
              ...session.tempData,
              customRequest: { description: message.text || incomingText, step: 2 },
            },
            expiresAt: nextExpiresAt,
          },
        };
      }

      if (currentStep === 2 && incomingText.length > 0) {
        const fullDesc = `${session.tempData.customRequest?.description} | Preferences: ${message.text || incomingText}`;
        return {
          actions: [
            { type: "SEND_TEXT", text: BotMessages.fallbackCustomSuccess },
            {
              type: "NOTIFY_ADMIN",
              title: "New Custom Order (Chat Fallback)",
              details: { phone: session.phone, description: fullDesc },
            },
          ],
          nextSession: {
            ...session,
            step: "AWAIT_QUOTE",
            tempData: {
              ...session.tempData,
              customRequest: { description: fullDesc, rawInput: incomingText },
            },
            expiresAt: nextExpiresAt,
          },
        };
      }

      return {
        actions: [{ type: "SEND_TEXT", text: BotMessages.repromptCustomFlow }],
        nextSession: { ...session, expiresAt: nextExpiresAt },
      };
    }

    case "AWAIT_QUOTE": {
      return {
        actions: [{ type: "SEND_TEXT", text: BotMessages.repromptAwaitQuote }],
        nextSession: { ...session, expiresAt: nextExpiresAt },
      };
    }

    case "CONFIRM": {
      const isConfirmed =
        message.buttonReply?.id === "BTN_CONFIRM_ORDER" ||
        message.buttonReply?.id === "BTN_ACCEPT_QUOTE" ||
        /^(confirm|accept|yes|ok|1)$/i.test(incomingText);
      const isCancelled =
        message.buttonReply?.id === "BTN_CANCEL_ORDER" ||
        message.buttonReply?.id === "BTN_DECLINE_QUOTE" ||
        /^(cancel|decline|no|2)$/i.test(incomingText);

      if (isConfirmed) {
        const amount =
          session.tempData.total ||
          session.tempData.quote?.amount ||
          0;

        const orderNo = session.tempData.orderNo || `ORD-${now.toISOString().slice(0, 10).replace(/-/g, "")}-STUB`;

        return {
          actions: [
            {
              type: "CREATE_ORDER",
              orderData: {
                orderNo,
                phone: session.phone,
                type: session.tempData.orderType || "menu",
                items: session.tempData.cart || [],
                customDetails: session.tempData.customRequest,
                quote: session.tempData.quote,
                subtotal: session.tempData.subtotal || amount,
                deliveryCharge: session.tempData.deliveryCharge || 0,
                total: amount,
                status: "pending_payment",
              },
            },
            {
              type: "CREATE_PAYMENT_LINK",
              orderNo,
              amount,
            },
            {
              type: "SEND_TEXT",
              text: `${BotMessages.orderConfirmed(orderNo, amount)}\n\n${BotMessages.paymentLinkStub(orderNo, amount)}`,
            },
          ],
          nextSession: {
            ...session,
            step: "AWAIT_PAYMENT",
            tempData: { ...session.tempData, orderNo, total: amount },
            expiresAt: nextExpiresAt,
          },
        };
      }

      if (isCancelled) {
        return {
          actions: [{ type: "SEND_TEXT", text: BotMessages.orderCancelled }],
          nextSession: {
            ...session,
            step: "IDLE",
            tempData: {},
            expiresAt: nextExpiresAt,
          },
        };
      }

      return {
        actions: [{ type: "SEND_TEXT", text: BotMessages.repromptConfirm }],
        nextSession: { ...session, expiresAt: nextExpiresAt },
      };
    }

    case "AWAIT_PAYMENT": {
      return {
        actions: [{ type: "SEND_TEXT", text: BotMessages.awaitingPaymentReminder }],
        nextSession: { ...session, expiresAt: nextExpiresAt },
      };
    }

    case "PAID": {
      return {
        actions: [
          {
            type: "SEND_TEXT",
            text: "Your order has been paid and is being prepared in the kitchen!",
          },
        ],
        nextSession: { ...session, expiresAt: nextExpiresAt },
      };
    }

    default: {
      return {
        actions: [{ type: "SEND_TEXT", text: BotMessages.repromptGeneral }],
        nextSession: { ...session, step: "IDLE", expiresAt: nextExpiresAt },
      };
    }
  }
}

/**
 * Triggered from admin side when staff quotes a custom order.
 * Transitions session from AWAIT_QUOTE to CONFIRM and yields quote buttons.
 */
export function handleAdminQuoteAction(
  session: BotSessionData,
  quote: { amount: number; note?: string },
  context: BotContext = {}
): BotTransitionResult {
  const now = context.now || new Date();
  const sessionTimeoutMin = context.sessionTimeoutMin || 30;
  const nextExpiresAt = new Date(now.getTime() + sessionTimeoutMin * 60 * 1000);

  return {
    actions: [
      {
        type: "SEND_BUTTONS",
        bodyText: BotMessages.quoteReceivedPrompt(quote.amount, quote.note),
        buttons: BotMessages.quoteButtons,
      },
    ],
    nextSession: {
      ...session,
      step: "CONFIRM",
      tempData: {
        ...session.tempData,
        quote,
        total: quote.amount,
      },
      expiresAt: nextExpiresAt,
    },
  };
}
