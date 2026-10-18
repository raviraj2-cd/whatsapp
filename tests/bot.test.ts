import assert from "node:assert";
import {
  handleAdminQuoteAction,
  handleBotTransition,
  isPastCutoff,
  recalculateCart,
} from "../lib/bot/machine";
import { BotContext, BotSessionData, MenuItemCatalogItem } from "../lib/bot/types";

const mockCatalog: MenuItemCatalogItem[] = [
  { id: "item_1", name: "Hyderabadi Dum Biryani", price: 320, category: "Main Course", available: true },
  { id: "item_2", name: "Paneer Butter Masala", price: 260, category: "Main Course", available: true },
  { id: "item_3", name: "Seasonal Mango Sweet", price: 150, category: "Desserts", available: false }, // unavailable!
];

const baseContext: BotContext = {
  now: new Date(2026, 9, 15, 10, 0, 0), // 10:00 AM local time
  cutoffTime: "13:00",
  deliveryCharge: 30,
  sessionTimeoutMin: 30,
  flowIds: { menuOrder: "flow_menu_123", customOrder: "flow_custom_456" },
  menuCatalog: mockCatalog,
};

function createSession(step: BotSessionData["step"], extra: Partial<BotSessionData> = {}): BotSessionData {
  return {
    phone: "+919876543210",
    step,
    tempData: {},
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    ...extra,
  };
}

function runAllTests() {
  console.log("Starting Bot State Machine Unit Tests...");

  // 1. Cutoff Time Logic
  assert.strictEqual(isPastCutoff(new Date("2026-10-15T09:30:00"), "13:00"), false, "9:30 AM should be before 13:00");
  assert.strictEqual(isPastCutoff(new Date("2026-10-15T13:00:00"), "13:00"), true, "13:00 should be past cutoff");
  assert.strictEqual(isPastCutoff(new Date("2026-10-15T14:15:00"), "13:00"), true, "14:15 should be past cutoff");

  // 2. Server Price Recalculation (Integrity check)
  const cartResult = recalculateCart(
    [
      { id: "item_1", quantity: 2 }, // 320 * 2 = 640
      { id: "item_3", quantity: 1 }, // unavailable! Should be skipped
    ],
    mockCatalog,
    30
  );
  assert.strictEqual(cartResult.cart.length, 1, "Unavailable items must be dropped");
  assert.strictEqual(cartResult.subtotal, 640, "Subtotal must equal 640");
  assert.strictEqual(cartResult.deliveryCharge, 30, "Delivery charge must equal 30");
  assert.strictEqual(cartResult.total, 670, "Total must equal 670");

  // 3. IDLE -> ASKED (Initiate daily ask)
  {
    const session = createSession("IDLE");
    const res = handleBotTransition(session, { type: "text", text: "hi" }, baseContext);
    assert.strictEqual(res.nextSession.step, "ASKED");
    assert.strictEqual(res.actions[0].type, "SEND_BUTTONS");
  }

  // 4. IDLE -> Past Cutoff Refusal
  {
    const session = createSession("IDLE");
    const res = handleBotTransition(
      session,
      { type: "text", text: "hi" },
      { ...baseContext, cutoffTime: "09:00" }
    );
    assert.strictEqual(res.nextSession.step, "IDLE");
    assert.strictEqual(res.actions[0].type, "SEND_TEXT");
    assert.match((res.actions[0] as any).text, /cutoff time/i);
  }

  // 5. ASKED -> Yes -> CHOOSE_TYPE
  {
    const session = createSession("ASKED");
    const res = handleBotTransition(
      session,
      { type: "button_reply", buttonReply: { id: "BTN_FOOD_YES", title: "Yes" } },
      baseContext
    );
    assert.strictEqual(res.nextSession.step, "CHOOSE_TYPE");
    assert.strictEqual(res.actions[0].type, "SEND_BUTTONS");
  }

  // 6. ASKED -> No -> IDLE + Log Declined
  {
    const session = createSession("ASKED");
    const res = handleBotTransition(
      session,
      { type: "button_reply", buttonReply: { id: "BTN_FOOD_NO", title: "No" } },
      baseContext
    );
    assert.strictEqual(res.nextSession.step, "IDLE");
    assert.strictEqual(res.actions[0].type, "SEND_TEXT");
    assert.strictEqual(res.actions[1].type, "LOG_DECLINED");
  }

  // 7. ASKED -> Invalid Input -> Reprompt
  {
    const session = createSession("ASKED");
    const res = handleBotTransition(session, { type: "text", text: "random nonsense" }, baseContext);
    assert.strictEqual(res.nextSession.step, "ASKED");
    assert.match((res.actions[0] as any).text, /please tap \[yes\] or \[no\]/i);
  }

  // 8. CHOOSE_TYPE -> Menu Order -> MENU_FLOW
  {
    const session = createSession("CHOOSE_TYPE");
    const res = handleBotTransition(
      session,
      { type: "button_reply", buttonReply: { id: "BTN_MENU_ORDER", title: "Menu Order" } },
      baseContext
    );
    assert.strictEqual(res.nextSession.step, "MENU_FLOW");
    assert.strictEqual(res.actions[0].type, "SEND_FLOW");
    assert.strictEqual((res.actions[0] as any).flowId, "flow_menu_123");
  }

  // 9. CHOOSE_TYPE -> Customize -> CUSTOM_FLOW
  {
    const session = createSession("CHOOSE_TYPE");
    const res = handleBotTransition(
      session,
      { type: "button_reply", buttonReply: { id: "BTN_CUSTOM_ORDER", title: "Customize" } },
      baseContext
    );
    assert.strictEqual(res.nextSession.step, "CUSTOM_FLOW");
    assert.strictEqual(res.actions[0].type, "SEND_FLOW");
    assert.strictEqual((res.actions[0] as any).flowId, "flow_custom_456");
  }

  // 10. CHOOSE_TYPE -> Fallback to List message
  {
    const session = createSession("CHOOSE_TYPE");
    const res = handleBotTransition(session, { type: "text", text: "list" }, baseContext);
    assert.strictEqual(res.nextSession.step, "MENU_FLOW");
    assert.strictEqual(res.actions[0].type, "SEND_LIST");
  }

  // 11. MENU_FLOW -> Flow Submission (nfm_reply) -> Server Recomputation -> CONFIRM
  {
    const session = createSession("MENU_FLOW");
    const res = handleBotTransition(
      session,
      {
        type: "flow_reply",
        flowReply: {
          rawJson: '{"cart":[{"id":"item_1","quantity":2}]}',
          parsedData: { cart: [{ id: "item_1", quantity: 2 }] },
        },
      },
      baseContext
    );
    assert.strictEqual(res.nextSession.step, "CONFIRM");
    assert.strictEqual(res.nextSession.tempData.total, 670); // 320*2 + 30
    assert.strictEqual(res.actions[0].type, "SEND_BUTTONS");
    assert.match((res.actions[0] as any).bodyText, /Total Payable: ₹670/);
  }

  // 12. CUSTOM_FLOW -> Flow Submission -> AWAIT_QUOTE + Admin Notification
  {
    const session = createSession("CUSTOM_FLOW");
    const res = handleBotTransition(
      session,
      {
        type: "flow_reply",
        flowReply: {
          rawJson: '{"description":"Gluten-free khichdi without garlic","portion":"2"}',
          parsedData: { description: "Gluten-free khichdi without garlic", portion: "2" },
        },
      },
      baseContext
    );
    assert.strictEqual(res.nextSession.step, "AWAIT_QUOTE");
    assert.strictEqual(res.actions[0].type, "SEND_TEXT");
    assert.strictEqual(res.actions[1].type, "NOTIFY_ADMIN");
  }

  // 13. CUSTOM_FLOW -> Step-by-Step Chat Fallback
  {
    // Step 1: Dish description
    const session1 = createSession("CUSTOM_FLOW");
    const res1 = handleBotTransition(session1, { type: "text", text: "Spicy chicken curry" }, baseContext);
    assert.strictEqual(res1.nextSession.step, "CUSTOM_FLOW");
    assert.strictEqual(res1.nextSession.tempData.customRequest?.step, 2);

    // Step 2: Portions & dietary
    const res2 = handleBotTransition(res1.nextSession, { type: "text", text: "2 portions, less oil" }, baseContext);
    assert.strictEqual(res2.nextSession.step, "AWAIT_QUOTE");
    assert.strictEqual(res2.actions[1].type, "NOTIFY_ADMIN");
  }

  // 14. AWAIT_QUOTE -> Admin sets quote -> CONFIRM with [Accept] [Decline]
  {
    const session = createSession("AWAIT_QUOTE");
    const res = handleAdminQuoteAction(session, { amount: 450, note: "Includes 2 extra rotis" }, baseContext);
    assert.strictEqual(res.nextSession.step, "CONFIRM");
    assert.strictEqual(res.nextSession.tempData.total, 450);
    assert.strictEqual(res.actions[0].type, "SEND_BUTTONS");
    assert.match((res.actions[0] as any).bodyText, /Price: \*₹450\*/);
  }

  // 15. CONFIRM -> Confirm Order -> CREATE_ORDER + Payment Link -> AWAIT_PAYMENT
  {
    const session = createSession("CONFIRM", {
      tempData: {
        orderType: "menu",
        cart: [{ menuItemId: "item_1", name: "Hyderabadi Dum Biryani", price: 320, quantity: 2, total: 640 }],
        subtotal: 640,
        deliveryCharge: 30,
        total: 670,
      },
    });

    const res = handleBotTransition(
      session,
      { type: "button_reply", buttonReply: { id: "BTN_CONFIRM_ORDER", title: "Confirm Order" } },
      baseContext
    );

    assert.strictEqual(res.nextSession.step, "AWAIT_PAYMENT");
    assert.strictEqual(res.actions[0].type, "CREATE_ORDER");
    assert.strictEqual(res.actions[1].type, "CREATE_PAYMENT_LINK");
    assert.strictEqual(res.actions[2].type, "SEND_TEXT");
    assert.match((res.actions[2] as any).text, /Payment Link/);
  }

  // 16. CONFIRM -> Cancel -> IDLE
  {
    const session = createSession("CONFIRM");
    const res = handleBotTransition(
      session,
      { type: "button_reply", buttonReply: { id: "BTN_CANCEL_ORDER", title: "Cancel" } },
      baseContext
    );
    assert.strictEqual(res.nextSession.step, "IDLE");
    assert.match((res.actions[0] as any).text, /cancelled/i);
  }

  // 17. Universal Cancel Keyword ("cancel")
  {
    const session = createSession("MENU_FLOW");
    const res = handleBotTransition(session, { type: "text", text: "cancel" }, baseContext);
    assert.strictEqual(res.nextSession.step, "IDLE");
    assert.match((res.actions[0] as any).text, /cancelled/i);
  }

  // 18. Session Timeout Handling (expired session)
  {
    const expiredSession = createSession("CONFIRM", {
      expiresAt: new Date(baseContext.now!.getTime() - 1000), // In the past relative to context.now
    });
    const res = handleBotTransition(expiredSession, { type: "text", text: "yes" }, baseContext);
    assert.strictEqual(res.nextSession.step, "IDLE");
    assert.match((res.actions[0] as any).text, /timed out/i);
  }

  console.log("✔ All 18 Bot State Machine unit tests passed successfully!");
}

runAllTests();
