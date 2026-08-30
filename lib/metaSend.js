const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0";
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
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Meta Send API error", res.status, text);
  }
  return res;
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

async function sendTextMessage({ recipientId, text }) {
  const chunks = splitIntoChunks(text);
  for (const chunk of chunks) {
    await callSendApi({
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text: chunk },
    });
  }
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

// Fetch a customer-sent image (Messenger/Instagram attachment URL) and return
// it as an Anthropic image source block, or null if it can't be used. Meta's
// attachment URLs are short-lived, so we grab it now while it's fresh.
async function fetchImageBlock(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
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
