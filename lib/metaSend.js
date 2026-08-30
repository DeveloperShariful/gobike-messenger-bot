const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v23.0";
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

function graphUrl(path) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}?access_token=${encodeURIComponent(
    PAGE_ACCESS_TOKEN
  )}`;
}

async function callSendApi(body) {
  const res = await fetch(graphUrl("me/messages"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("Meta Send API error", res.status, text);
    return { ok: false, messageId: null };
  }
  let messageId = null;
  try {
    messageId = JSON.parse(text).message_id || null;
  } catch {
    /* no body */
  }
  return { ok: true, messageId };
}

// Messenger/Instagram both cap message length; split long replies into a
// few messages rather than one huge wall of text, and stay comfortably
// under the ~2000 char platform limit per message.
function splitIntoChunks(text, maxLen = 900) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > maxLen && current) {
      chunks.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

async function sendTextMessage({ recipientId, text, quickReplies }) {
  const chunks = splitIntoChunks(text);
  const qr =
    Array.isArray(quickReplies) && quickReplies.length
      ? quickReplies.slice(0, 13).map((t) => ({
          content_type: "text",
          title: String(t).slice(0, 20),
          payload: String(t).slice(0, 100),
        }))
      : null;
  const sentMids = [];
  for (let i = 0; i < chunks.length; i++) {
    const message = { text: chunks[i] };
    // Quick replies ride on the last message only.
    if (qr && i === chunks.length - 1) message.quick_replies = qr;
    const r = await callSendApi({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message,
    });
    if (r && r.messageId) sentMids.push(r.messageId);
  }
  return { sentMids };
}

async function sendTypingOn(recipientId) {
  await callSendApi({
    recipient: { id: recipientId },
    sender_action: "typing_on",
  }).catch(() => {});
}

async function sendMarkSeen(recipientId) {
  await callSendApi({
    recipient: { id: recipientId },
    sender_action: "mark_seen",
  }).catch(() => {});
}

async function tryFetchImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "GoBikeBot/1.0" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const mediaType = (res.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    // Keep the base64 payload comfortably under Anthropic's 5 MB image limit.
    if (buf.length > 3.5 * 1024 * 1024 || buf.length === 0) return null;
    return { type: "base64", media_type: mediaType, data: buf.toString("base64") };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Fetch a customer-sent image (Messenger/Instagram attachment URL) and return
// it as an Anthropic image source block, or null if it can't be used. Meta's
// attachment URLs are short-lived. Some (lookaside.fbsbx.com) only serve with
// the page token appended, so retry that way if the plain fetch fails.
async function fetchImageBlock(url) {
  if (!url) return null;
  let block = await tryFetchImage(url);
  if (!block && PAGE_ACCESS_TOKEN && /fbsbx\.com|lookaside/.test(url)) {
    const sep = url.includes("?") ? "&" : "?";
    block = await tryFetchImage(
      `${url}${sep}access_token=${encodeURIComponent(PAGE_ACCESS_TOKEN)}`
    );
  }
  return block;
}

// Best-effort display name for a PSID/IGSID, for team notifications. Returns
// null on any failure (token missing, user not resolvable, etc.).
async function getUserName(platform, id) {
  if (!PAGE_ACCESS_TOKEN || !id) return null;
  const fields = platform === "instagram" ? "name,username" : "first_name,last_name";
  try {
    const res = await fetch(`${graphUrl(id)}&fields=${fields}`);
    if (!res.ok) return null;
    const d = await res.json();
    const name =
      d.name ||
      [d.first_name, d.last_name].filter(Boolean).join(" ") ||
      d.username ||
      null;
    return name || null;
  } catch {
    return null;
  }
}

module.exports = {
  sendTextMessage,
  sendTypingOn,
  sendMarkSeen,
  getUserName,
  fetchImageBlock,
};
