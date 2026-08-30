/**
 * Team notifications. Right now: a Telegram message when the bot escalates a
 * conversation to a human. No-ops quietly if TELEGRAM_BOT_TOKEN /
 * TELEGRAM_CHAT_ID aren't set, so the bot runs fine before it's configured.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const DASHBOARD_URL =
  process.env.DASHBOARD_URL ||
  "https://gobike-messenger-bot.onrender.com/dashboard";

function configured() {
  return Boolean(TOKEN && CHAT_ID);
}

// Telegram HTML parse mode: only < > & need escaping.
function esc(s) {
  return String(s == null ? "" : s).replace(
    /[<>&]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])
  );
}

async function sendTelegram(text) {
  if (!configured()) return { ok: false, skipped: true };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[notify] Telegram send failed", res.status, body);
      return { ok: false, status: res.status, body };
    }
    return { ok: true };
  } catch (err) {
    console.error("[notify] Telegram error", err.message);
    return { ok: false, error: err.message };
  }
}

function formatTranscript(transcript) {
  if (!Array.isArray(transcript) || !transcript.length) return null;
  const rows = transcript
    .filter((m) => m && m.content)
    .map((m) => {
      const who = m.role === "assistant" ? "Bot" : "Customer";
      const text = String(m.content).replace(/\s+/g, " ").trim().slice(0, 300);
      return `<b>${who}:</b> ${esc(text)}`;
    });
  return rows.length ? rows.join("\n") : null;
}

async function notifyEscalation({
  platform,
  reason,
  lastMessage,
  customerName,
  transcript,
}) {
  const when = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const convo = formatTranscript(transcript);
  const lines = [
    "🔔 <b>GoBike — a customer needs a human</b>",
    "",
    `<b>Platform:</b> ${esc(platform)}`,
    customerName ? `<b>Customer:</b> ${esc(customerName)}` : null,
    `<b>Reason:</b> ${esc(reason || "—")}`,
    `<b>Time:</b> ${esc(when)} (Sydney)`,
    convo ? "" : null,
    convo ? "<b>Recent conversation:</b>" : null,
    convo,
    !convo && lastMessage
      ? `<b>Last message:</b> ${esc(String(lastMessage).slice(0, 500))}`
      : null,
    "",
    `<a href="${esc(DASHBOARD_URL)}">Open the dashboard →</a>`,
  ].filter((l) => l !== null && l !== undefined);
  return sendTelegram(lines.join("\n"));
}

async function sendTestNotification() {
  return sendTelegram(
    [
      "✅ <b>GoBike bot — test notification</b>",
      "",
      "If you can see this in the group, escalation alerts are wired up correctly.",
    ].join("\n")
  );
}

module.exports = { notifyEscalation, sendTestNotification, configured };
