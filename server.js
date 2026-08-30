require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const {
  sendTextMessage,
  sendTypingOn,
  sendMarkSeen,
  fetchImageBlock,
} = require("./lib/metaSend");
const { generateReply } = require("./lib/claudeAgent");
const {
  saveMessage,
  getRecentHistory,
  getSetting,
  pauseThread,
  isThreadPaused,
  saveReferral,
  getReferral,
  savePendingImages,
  getPendingImages,
  clearPendingImages,
  runMigrations,
} = require("./lib/db");
const {
  requirePage,
  requireApi,
  handleLogin,
  handleLogout,
} = require("./lib/dashboardAuth");
const adminApi = require("./lib/adminApi");
const { createRateLimiter } = require("./lib/rateLimit");

const app = express();
// Render (and most hosts) sit behind a proxy — trust it so client IPs are
// read from X-Forwarded-For for rate limiting.
app.set("trust proxy", 1);

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;

// After the bot hands a thread to a human (or a team member replies from the
// inbox), it stays quiet on that thread for this many minutes past the last
// human reply, then picks it back up on its own.
const RESUME_AFTER_MIN = Number(process.env.BOT_RESUME_AFTER_MINUTES) || 10;

// Brute-force / flood protection.
const dashboardLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 300,
  message: "Too many requests to the dashboard. Try again in a few minutes.",
});
const webhookLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 600,
  message: "Too many requests.",
});
// Tighter limit on the sign-in endpoint to slow password guessing.
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many sign-in attempts. Try again in about 15 minutes.",
});

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

// -------- Dashboard sign-in (form-based session, styled page) --------
app.get("/login", dashboardLimiter, (req, res) =>
  res.sendFile(path.join(__dirname, "public", "login.html"))
);
app.post("/login", loginLimiter, handleLogin);
app.post("/logout", handleLogout);

// -------- Dashboard (rate-limited + session auth) --------
app.get("/dashboard", dashboardLimiter, requirePage, (req, res) =>
  res.sendFile(path.join(__dirname, "public", "dashboard.html"))
);
app.use("/api/admin", dashboardLimiter, requireApi, adminApi);

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

// Don't spam the attachment acknowledgement when a customer sends a burst of
// photos. One ack per thread per 10 minutes is plenty.
const attachmentAckAt = new Map();
function recentlyAckedAttachment(senderId) {
  const last = attachmentAckAt.get(senderId) || 0;
  if (Date.now() - last < 10 * 60 * 1000) return true;
  attachmentAckAt.set(senderId, Date.now());
  if (attachmentAckAt.size > 2000) attachmentAckAt.clear();
  return false;
}

// Pull the image attachments off a Messenger/Instagram message and fetch each
// one (the URLs die quickly). Returns Anthropic base64 image-source objects.
async function fetchMessageImages(message) {
  const urls = ((message && message.attachments) || [])
    .filter((a) => a && a.type === "image" && a.payload && a.payload.url)
    .map((a) => a.payload.url)
    .slice(0, 3);
  const sources = [];
  for (const url of urls) {
    const s = await fetchImageBlock(url).catch(() => null);
    if (s) sources.push(s);
  }
  return { sources, attempted: urls.length };
}

// -------- Incoming messages (Messenger + Instagram share this shape) --------
app.post("/webhook", webhookLimiter, verifySignature, async (req, res) => {
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
  // Echo of a message sent AS the Page. Our own Send API calls carry our
  // app_id and we ignore them. A message a human typed in the Business Suite
  // inbox has no app_id — treat that as a team member taking over: hush the
  // bot on that thread and record their reply so the dashboard stays in sync.
  if (event.message && event.message.is_echo) {
    const customerId = event.recipient && event.recipient.id;
    if (
      !event.message.app_id &&
      customerId &&
      !alreadyProcessed(event.message.mid)
    ) {
      await pauseThread({
        platform,
        senderId: customerId,
        reason: "A team member replied from the inbox",
      }).catch(() => {});
      if (typeof event.message.text === "string" && event.message.text.trim()) {
        await saveMessage({
          platform,
          senderId: customerId,
          role: "assistant",
          content: event.message.text.trim(),
        }).catch(() => {});
      }
    }
    return;
  }

  const senderId = event.sender && event.sender.id;
  if (!senderId) return;

  // -------- Click-to-Messenger ad referral --------
  // Meta sends this when a customer clicks a Facebook/Instagram ad or an
  // m.me/?ref= link. It can arrive on its own (returning customer) or attached
  // to their first message (new customer). Stash it so the bot knows which
  // product/offer they're asking about.
  const referral = event.referral || (event.message && event.message.referral);
  if (referral) {
    const ctx = referral.ads_context_data || {};
    await saveReferral({
      platform,
      senderId,
      source: referral.source || "",
      ref: referral.ref || "",
      adId: referral.ad_id || "",
      adTitle: ctx.ad_title || "",
    }).catch((err) => console.error("saveReferral failed", err));
  }

  // A referral with no message of its own (returning customer clicked an ad),
  // or a message we can't read (attachment / sticker only). In both cases send
  // one short acknowledgement so the customer isn't left on read - unless the
  // bot is switched off or a human has the thread.
  const isReferralOnly = referral && !event.message;
  const isAttachmentOnly =
    event.message &&
    (typeof event.message.text !== "string" || !event.message.text.trim());

  if (isReferralOnly || isAttachmentOnly) {
    const mid = isReferralOnly
      ? "ref:" + senderId + ":" + (referral.ad_id || referral.ref || Date.now())
      : event.message.mid;
    if (alreadyProcessed(mid)) return;
    if (isAttachmentOnly && !event.message.attachments) return; // delivery/read receipt
    if (isAttachmentOnly && recentlyAckedAttachment(senderId)) return;

    const st = await getBotState();
    if (!st.enabled) return;
    if (await isThreadPaused({ platform, senderId, resumeAfterMinutes: RESUME_AFTER_MIN }).catch(() => false)) {
      return;
    }

    let ack = "Hey! Thanks for checking out GoBike - what can I help you with?";
    if (isAttachmentOnly) {
      // Grab the image(s) now (URLs expire) and stash them, so when the
      // customer types their question next the bot can look at what they sent.
      const { sources } = await fetchMessageImages(event.message);
      if (sources.length) {
        await savePendingImages({ platform, senderId, images: sources }).catch(() => {});
        ack = "Got your photo! What would you like to know about it?";
      } else {
        ack =
          "Thanks for that! I can't open that kind of attachment - pop your " +
          "question in a message and I'll help. For a warranty claim, the form " +
          "at gobike.au/warranty takes photos and video.";
      }
    }
    await sendMarkSeen(senderId).catch(() => {});
    await sendTextMessage({ recipientId: senderId, text: ack }).catch(() => {});
    await saveMessage({ platform, senderId, role: "assistant", content: ack }).catch(
      () => {}
    );
    return;
  }

  // Skip anything else without a readable message (delivery/read receipts).
  if (!event.message || typeof event.message.text !== "string") return;

  const messageId = event.message.mid;
  if (alreadyProcessed(messageId)) return;

  const userText = event.message.text.trim();
  if (!userText) return;

  sendMarkSeen(senderId).catch(() => {});

  // -------- Per-thread pause --------
  // The bot handed this conversation to a human (or a human jumped in). Stay
  // quiet and just log what the customer says; the pause lifts on its own
  // after BOT_RESUME_AFTER_MINUTES and the bot picks the thread back up.
  const paused = await isThreadPaused({
    platform,
    senderId,
    resumeAfterMinutes: RESUME_AFTER_MIN,
  }).catch(() => false);
  if (paused) {
    await saveMessage({ platform, senderId, role: "user", content: userText }).catch(
      () => {}
    );
    return;
  }

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
    const adContext = await getReferral({ platform, senderId }).catch(() => null);

    // Images: any attached to this message, plus any the customer sent just
    // before typing their question (pre-fetched and stashed).
    const { sources: freshImages, attempted } = await fetchMessageImages(event.message);
    const pendingImages = await getPendingImages({ platform, senderId }).catch(() => []);
    const imageSources = [...freshImages, ...pendingImages].slice(0, 3);
    const imagesFailed = attempted > 0 && freshImages.length === 0;
    if (pendingImages.length) {
      await clearPendingImages({ platform, senderId }).catch(() => {});
    }

    const { replyText, escalated } = await generateReply({
      platform,
      senderId,
      userText,
      history,
      adContext,
      imageSources,
      imagesFailed,
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

// Create the bot's own tables if they don't exist yet. Doesn't block startup
// or crash the server if the DB isn't reachable — the dashboard shows that.
runMigrations()
  .then(() => console.log("DB schema ready (bot tables created/verified)."))
  .catch((err) =>
    console.error(
      "DB schema setup skipped —",
      err.message,
      "(check DATABASE_URL; the dashboard Setup tab shows status)"
    )
  );
