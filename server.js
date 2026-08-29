require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const { sendTextMessage, sendTypingOn, sendMarkSeen } = require("./lib/metaSend");
const { generateReply } = require("./lib/claudeAgent");
const { saveMessage, getRecentHistory } = require("./lib/db");

const app = express();

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;

// Keep the raw body around so we can verify Meta's X-Hub-Signature-256.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// -------- Health check (handy for Railway/Render) --------
app.get("/", (req, res) => res.status(200).send("GoBike bot is running."));

// -------- Webhook verification (Meta calls this once when you save the
// webhook URL in the App Dashboard) --------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// -------- Signature check middleware for incoming events --------
function verifySignature(req, res, next) {
  if (!APP_SECRET) {
    console.warn(
      "META_APP_SECRET not set — skipping signature verification. Set this before going live."
    );
    return next();
  }
  const signature = req.get("X-Hub-Signature-256");
  if (!signature) return res.sendStatus(401);

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    return res.sendStatus(401);
  }
  next();
}

// Simple in-memory dedup for redelivered webhook events. Fine for a
// single-instance deployment; swap for Redis if you ever scale to
// multiple instances behind a load balancer.
const seenMessageIds = new Set();
function alreadyProcessed(id) {
  if (!id) return false;
  if (seenMessageIds.has(id)) return true;
  seenMessageIds.add(id);
  if (seenMessageIds.size > 5000) {
    seenMessageIds.clear();
  }
  return false;
}

// -------- Incoming messages (Messenger + Instagram share this shape) --------
app.post("/webhook", verifySignature, async (req, res) => {
  // Ack immediately — Meta expects a fast 200, we do the real work after.
  res.status(200).send("EVENT_RECEIVED");

  const body = req.body;
  if (body.object !== "page" && body.object !== "instagram") return;

  const platform = body.object === "instagram" ? "instagram" : "messenger";

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      handleMessagingEvent(platform, event).catch((err) =>
        console.error("Error handling messaging event:", err)
      );
    }
  }
});

async function handleMessagingEvent(platform, event) {
  const senderId = event.sender && event.sender.id;
  if (!senderId) return;

  // Ignore echoes of our own sent messages, delivery/read receipts, and
  // anything without actual text (stickers/attachments-only for now).
  if (event.message && event.message.is_echo) return;
  if (!event.message || typeof event.message.text !== "string") return;

  const messageId = event.message.mid;
  if (alreadyProcessed(messageId)) return;

  const userText = event.message.text.trim();
  if (!userText) return;

  sendTypingOn(senderId).catch(() => {});
  sendMarkSeen(senderId).catch(() => {});

  try {
    const history = await getRecentHistory({ platform, senderId });
    const { replyText, escalated } = await generateReply({
      platform,
      senderId,
      userText,
      history,
    });

    await sendTextMessage({ recipientId: senderId, text: replyText });

    await saveMessage({ platform, senderId, role: "user", content: userText });
    await saveMessage({
      platform,
      senderId,
      role: "assistant",
      content: replyText,
    });

    if (escalated) {
      console.log(`Escalated to human: ${platform} / ${senderId}`);
    }
  } catch (err) {
    console.error("Failed to generate/send reply:", err);
    await sendTextMessage({
      recipientId: senderId,
      text:
        "Sorry, something went wrong on our end just now — mind trying again in a moment? If it keeps happening, email gobike@gobike.au and we'll sort it out.",
    }).catch(() => {});
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GoBike bot listening on port ${PORT}`));
