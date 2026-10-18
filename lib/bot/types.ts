export type BotState =
  | "IDLE"
  | "ASKED"
  | "CHOOSE_TYPE"
  | "MENU_FLOW"
  | "CUSTOM_FLOW"
  | "AWAIT_QUOTE"
  | "CONFIRM"
  | "AWAIT_PAYMENT"
  | "PAID";

export type BotAction =
  | { type: "SEND_TEXT"; text: string }
  | { type: "SEND_BUTTONS"; bodyText: string; buttons: { id: string; title: string }[] }
  | { type: "SEND_LIST"; bodyText: string; buttonText: string; sections: { title: string; rows: { id: string; title: string; description?: string }[] }[] }
  | { type: "SEND_TEMPLATE"; templateName: string; languageCode?: string; components?: any[] }
  | { type: "SEND_FLOW"; flowId: string; flowToken: string; screen: string; ctaText: string; bodyText: string; payload?: Record<string, unknown> }
  | { type: "CREATE_ORDER"; orderData: Record<string, unknown> }
  | { type: "CREATE_PAYMENT_LINK"; orderNo: string; amount: number }
  | { type: "NOTIFY_ADMIN"; title: string; details: Record<string, unknown> }
  | { type: "LOG_DECLINED"; phone: string; date: string }
  | { type: "SAVE_SESSION"; session: BotSessionData };

export interface CartItemInput {
  id?: string;
  menuItemId?: string;
  name?: string;
  quantity: number;
}

export interface BotSessionData {
  userId?: string;
  phone: string;
  step: BotState;
  tempData: {
    orderType?: "menu" | "custom";
    flowToken?: string;
    cart?: Array<{
      menuItemId: string;
      name: string;
      price: number;
      quantity: number;
      total: number;
    }>;
    customRequest?: {
      description: string;
      rawInput?: string;
      step?: number;
      dietary?: string;
      portion?: string;
    };
    quote?: {
      amount: number;
      note?: string;
    };
    subtotal?: number;
    deliveryCharge?: number;
    total?: number;
    orderNo?: string;
    orderId?: string;
    fallbackActive?: boolean;
    lastAskedAt?: string;
    [key: string]: unknown;
  };
  flowToken?: string;
  flowName?: string;
  expiresAt: Date;
}

export interface MenuItemCatalogItem {
  id: string;
  name: string;
  price: number;
  category: string;
  available: boolean;
  description?: string;
}

export interface BotContext {
  now?: Date;
  cutoffTime?: string; // "13:00"
  deliveryCharge?: number;
  sessionTimeoutMin?: number;
  flowIds?: {
    menuOrder?: string;
    customOrder?: string;
    viewOrder?: string;
  };
  menuCatalog?: MenuItemCatalogItem[];
}

export interface BotIncomingMessage {
  type: "text" | "button_reply" | "list_reply" | "flow_reply" | "other";
  text?: string;
  buttonReply?: { id: string; title: string };
  listReply?: { id: string; title: string; description?: string };
  flowReply?: {
    rawJson: string;
    parsedData: Record<string, unknown> | null;
  };
}

export interface BotTransitionResult {
  actions: BotAction[];
  nextSession: BotSessionData;
}
