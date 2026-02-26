/**
 * Shared Telegram notification utility for admin alerts.
 * Sends messages to the configured Telegram group via Bot API.
 * Failures are silently logged — never blocks the calling function.
 */

const TELEGRAM_API = "https://api.telegram.org";

export async function sendTelegramAlert(message: string): Promise<void> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!botToken || !chatId) {
    console.warn("[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID — skipping alert");
    return;
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Telegram] API error:", res.status, err);
    } else {
      // Consume body to prevent resource leak
      await res.text();
      console.log("[Telegram] Alert sent successfully");
    }
  } catch (err) {
    console.error("[Telegram] Failed to send alert:", err);
  }
}

/**
 * Pre-built formatters for common admin events.
 * All return HTML-formatted strings for Telegram.
 */
export const TelegramAlerts = {
  newSignup: (email: string) =>
    `🆕 <b>New Signup</b>\n📧 ${escapeHtml(email)}`,

  creditPurchase: (email: string, credits: number, amount: string) =>
    `💰 <b>Credit Purchase</b>\n📧 ${escapeHtml(email)}\n💳 ${credits} credits ($${amount})`,

  newOrder: (orderNumber: string, siteName: string, amountCents: number) =>
    `📦 <b>New Order</b>\n🔢 #${escapeHtml(orderNumber)}\n🌐 ${escapeHtml(siteName)}\n💵 $${(amountCents / 100).toFixed(2)}`,

  orderDelivered: (orderNumber: string, siteName: string) =>
    `✅ <b>Order Delivered</b>\n🔢 #${escapeHtml(orderNumber)}\n🌐 ${escapeHtml(siteName)}`,

  newAgencyApplication: (agencyName: string, country: string) =>
    `🏢 <b>New Agency Application</b>\n📋 ${escapeHtml(agencyName)}\n🌍 ${escapeHtml(country)}`,

  withdrawalRequest: (agencyName: string, amount: string, method: string) =>
    `🏦 <b>Withdrawal Request</b>\n🏢 ${escapeHtml(agencyName)}\n💵 $${amount}\n📤 ${escapeHtml(method)}`,

  newSupportTicket: (subject: string, email: string) =>
    `🎫 <b>New Support Ticket</b>\n📝 ${escapeHtml(subject)}\n📧 ${escapeHtml(email)}`,

  newDispute: (orderNumber: string, reason: string) =>
    `⚠️ <b>New Dispute</b>\n🔢 #${escapeHtml(orderNumber)}\n📝 ${escapeHtml(reason || "No reason provided")}`,

  newWpSiteSubmission: (siteName: string, siteUrl: string) =>
    `🌐 <b>New WP Site Submission</b>\n📋 ${escapeHtml(siteName)}\n🔗 ${escapeHtml(siteUrl)}`,

  newMediaSiteSubmission: (agencyName: string) =>
    `📰 <b>New Media Site Submission</b>\n🏢 ${escapeHtml(agencyName)}`,

  customVerification: (companyName: string, country: string) =>
    `📋 <b>New KYC Verification</b>\n🏢 ${escapeHtml(companyName)}\n🌍 ${escapeHtml(country)}`,

  bugReport: (subject: string, category: string) =>
    `🐛 <b>Bug Report</b>\n📝 ${escapeHtml(subject)}\n📂 ${escapeHtml(category)}`,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
