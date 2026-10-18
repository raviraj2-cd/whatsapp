/**
 * All conversational customer-facing message strings, prompts, and button labels.
 * Editable in one central place.
 */

export const BotMessages = {
  // 1. Initial Prompt
  dailyAskPrompt: "Need food today? Freshly prepared home-style meals ready for lunch.",
  dailyAskButtons: [
    { id: "BTN_FOOD_YES", title: "Yes, I'm hungry" },
    { id: "BTN_FOOD_NO", title: "No, thank you" },
  ],

  // 2. Declined / No
  foodDeclined: "No worries! Have a wonderful day ahead. We'll check in with you tomorrow.",

  // 3. Choose Order Type
  chooseOrderTypePrompt: "Great! How would you like to place your order today?",
  chooseOrderTypeButtons: [
    { id: "BTN_MENU_ORDER", title: "Menu Order" },
    { id: "BTN_CUSTOM_ORDER", title: "Customize" },
  ],

  // 4. Flows CTA
  menuFlowPrompt: "Tap the button below to browse our live menu and select your dishes:",
  menuFlowCta: "Open Menu",

  customFlowPrompt: "Tap below to specify what you would like cooked, spice level, or special dietary requests:",
  customFlowCta: "Customize Meal",

  // 5. Menu Summary Confirmation
  menuSummaryHeader: "📋 *Order Summary*",
  confirmOrderButtons: [
    { id: "BTN_CONFIRM_ORDER", title: "Confirm Order" },
    { id: "BTN_CANCEL_ORDER", title: "Cancel" },
  ],

  // 6. Custom Flow Received
  customOrderReceived: "Thank you! We have received your custom meal request. Our chef is reviewing it now and will send you a price quote shortly.",

  // 7. Admin Quote Notification
  quoteReceivedPrompt: (amount: number, note?: string) =>
    `👨‍🍳 *Chef's Quote Received*\n\nPrice: *₹${amount}*${note ? `\nNote: ${note}` : ""}\n\nWould you like to accept this quote and proceed to payment?`,
  quoteButtons: [
    { id: "BTN_ACCEPT_QUOTE", title: "Accept Quote" },
    { id: "BTN_DECLINE_QUOTE", title: "Decline" },
  ],

  // 8. Order Confirmed & Payment Link
  orderConfirmed: (orderNo: string, total: number) =>
    `🎉 *Order Confirmed!*\n\nOrder No: *${orderNo}*\nTotal Payable: *₹${total}*\n\nPlease complete your payment securely via the link below:`,

  paymentLinkStub: (orderNo: string, amount: number) =>
    `💳 *Payment Link*: https://rzp.io/i/mock-${orderNo} (Amount: ₹${amount})\n_Pay within 15 minutes to secure your slot._`,

  // 9. Payment Reminders
  awaitingPaymentReminder: "Your order is pending payment. Please use the link above to complete payment so our kitchen can begin preparing your meal.",

  // 10. Cancellation & Timeout
  orderCancelled: "Your order session has been cancelled. Reply with 'hi' or 'menu' anytime to start again.",
  sessionExpired: "Your session has timed out due to inactivity. Feel free to message us again when you're ready to order!",

  // 11. Cutoff Time Passed
  cutoffTimePassed: (cutoff: string) =>
    `⏳ Sorry! Orders for today are closed as our cutoff time (*${cutoff}*) has passed. Please check back with us tomorrow morning!`,

  // 12. Fallbacks (When WhatsApp Flow is unsupported or fails)
  fallbackMenuListHeader: "Here is today's available menu. Please select an item to add to your order:",
  fallbackMenuListButton: "View Items",
  fallbackCustomStep1: "Please type a short description of the dish you'd like our kitchen to make for you:",
  fallbackCustomStep2: "Got it! How many portions, and do you have any dietary preferences (e.g. less oil, spicy, Jain)?",
  fallbackCustomSuccess: "Custom details recorded! Our kitchen team will review and quote you shortly.",

  // 13. Re-prompts for Invalid Inputs
  repromptAsked: "Please tap [Yes] or [No] above to let us know if you need food today.",
  repromptChooseType: "Please choose whether you want to order from the [Menu Order] or [Customize] your meal.",
  repromptMenuFlow: "Please complete your item selection in the opened menu window, or reply 'list' to order via chat text.",
  repromptCustomFlow: "Please submit the customization form or type your dish requirements here.",
  repromptAwaitQuote: "Your request is currently with the chef. We'll send your quote as soon as it's ready!",
  repromptConfirm: "Please tap [Confirm Order] to place the order, or [Cancel] to exit.",
  repromptGeneral: "I didn't quite catch that. Type 'menu' to see options, or 'cancel' to reset.",
};
