require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { sendTextMessage, sendTypingOn, sendMarkSeen } = require("./lib/metaSend");
const { generateReply } = require("./lib/claudeAgent");
const { saveMessage, getRecentHistory, getSetting } = require("./lib/db");
const { dashboardAuth } = require("./lib/dashboardAuth");
const adminApi = require("./lib/adminApi");

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

// -------- Landing / health check (Render pings this) --------
app.get("/", (req, res) =>
  res
    .status(200)
    .type("html")
    .send(
      `<!doctype html><meta charset="utf-8"><title>GoBike Bot</title>
       <body style="font:15px/1.6 system-ui,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.2rem;color:#1c2024">
       <h1 style="font-size:1.15rem">GoBike bot is running ✅</h1>
       <p style="color:#6b7280">Auto-reply for Facebook Messenger &amp; Instagram DMs.</p>
       <p><a href="/dashboard" style="color:#1f7a4d;font-weight:600">Open the dashboard →</a></p>
       </body>`
    )
);

// -------- Dashboard (Basic Auth) --------
app.get("/dashboard", dashboardAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "public", "dashboard.html"))
);
app.use("/api/admin", dashboardAuth, adminApi);

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

// Cache the on/off switch so we're not hitting the DB on every single
// inbound event. ~30s staleness is fine for a kill switch.
let botStateCache = { at: 0, enabled: true, offlineMessage: "" };
async function getBotState() {
  if (Date.now() - botStateCache.at < 30000) return botStateCache;
  try {
    const [enabled, offlineMessage] = await Promise.all([
      getSetting("bot_enabled", "true"),
      getSetting(
        "offline_message",
        "Thanks for your message! Our team will get back to you as soon as we can."
      ),
    ]);
    botStateCache = {
      at: Date.now(),
      enabled: enabled !== "false",
      offlineMessage,
    };
  } catch (err) {
    console.error("getBotState failed, assuming enabled:", err.message);
    botStateCache = { at: Date.now(), enabled: true, offlineMessage: "" };
  }
  return botStateCache;
}

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

  sendMarkSeen(senderId).catch(() => {});

  // -------- Global on/off switch (dashboard) --------
  const botState = await getBotState();
  if (!botState.enabled) {
    const history = await getRecentHistory({ platform, senderId }).catch(() => []);
    const last = history[history.length - 1];
    const alreadyToldThem =
      last && last.role === "assistant" && last.content === botState.offlineMessage;
    await saveMessage({ platform, senderId, role: "user", content: userText }).catch(
      () => {}
    );
    if (botState.offlineMessage && !alreadyToldThem) {
      await sendTextMessage({
        recipientId: senderId,
        text: botState.offlineMessage,
      }).catch(() => {});
      await saveMessage({
        platform,
        senderId,
        role: "assistant",
        content: botState.offlineMessage,
      }).catch(() => {});
    }
    return;
  }

  sendTypingOn(senderId).catch(() => {});

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
    // Still record the customer's message so it shows up in the dashboard
    // (someone messaged during an outage and needs following up).
    await saveMessage({ platform, senderId, role: "user", content: userText }).catch(
      () => {}
    );
    await sendTextMessage({
      recipientId: senderId,
      text:
        "Sorry, something went wrong on our end just now — mind trying again in a moment? If it keeps happening, email gobike@gobike.au and we'll sort it out.",
    }).catch(() => {});
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GoBike bot listening on port ${PORT}`));
