const express = require("express");
const db = require("./db");
const shopClient = require("./shopClient");

const router = express.Router();

// Small wrapper so async handler errors become 500s instead of hanging.
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error("[adminApi]", req.method, req.path, err);
    res.status(500).json({ error: err.message || "Internal error" });
  });

const ALLOWED_SETTINGS = new Set([
  "bot_enabled",
  "kb_override",
  "offline_message",
]);

// -------- Health / setup status (no secrets, just booleans) --------
router.get(
  "/health",
  wrap(async (req, res) => {
    const setup = await db.checkSetup();
    let shop = { reachable: false };
    try {
      const catalog = await shopClient.getCatalog();
      shop = {
        reachable: Boolean(catalog),
        baseUrl: shopClient.cacheStatus().baseUrl,
        productCount: catalog ? catalog.productCount : 0,
      };
    } catch (err) {
      shop = { reachable: false, error: err.message };
    }
    res.json({
      database: setup,
      shop,
      config: {
        anthropic_key: Boolean(process.env.ANTHROPIC_API_KEY),
        claude_model: process.env.CLAUDE_MODEL || "claude-sonnet-5",
        meta_page_token: Boolean(process.env.META_PAGE_ACCESS_TOKEN),
        meta_app_secret: Boolean(process.env.META_APP_SECRET),
        meta_verify_token: Boolean(process.env.META_VERIFY_TOKEN),
        bot_api_key: Boolean(process.env.BOT_API_KEY),
        shop_api_base_url: process.env.SHOP_API_BASE_URL || "https://gobike.au",
        support_email: process.env.SUPPORT_EMAIL || "gobike@gobike.au",
      },
      webhook_url:
        (req.headers["x-forwarded-proto"] || "https") +
        "://" +
        req.headers.host +
        "/webhook",
    });
  })
);

router.get(
  "/stats",
  wrap(async (req, res) => {
    try {
      res.json({ ...(await db.getStats()), db_ready: true });
    } catch (err) {
      // Tables not created yet — don't blow up the whole dashboard.
      console.warn("[adminApi] /stats:", err.message);
      res.json({
        messages_24h: 0,
        messages_7d: 0,
        customers_7d: 0,
        customers_total: 0,
        open_handoffs: 0,
        total_handoffs: 0,
        db_ready: false,
      });
    }
  })
);

router.get(
  "/handoffs",
  wrap(async (req, res) => {
    const resolved = req.query.resolved === "true";
    try {
      res.json(await db.listHandoffs({ resolved }));
    } catch (err) {
      res.json([]);
    }
  })
);

router.post(
  "/handoffs/:id/resolve",
  wrap(async (req, res) => {
    await db.resolveHandoff(req.params.id);
    res.json({ ok: true });
  })
);

router.get(
  "/senders",
  wrap(async (req, res) => {
    try {
      res.json(await db.listRecentSenders({ limit: 60 }));
    } catch (err) {
      res.json([]);
    }
  })
);

router.get(
  "/thread",
  wrap(async (req, res) => {
    const { platform, senderId } = req.query;
    if (!platform || !senderId) {
      return res.status(400).json({ error: "platform and senderId required" });
    }
    res.json(await db.getThread({ platform, senderId }));
  })
);

router.get(
  "/settings",
  wrap(async (req, res) => {
    try {
      res.json(await db.getAllSettings());
    } catch (err) {
      res.json({});
    }
  })
);

router.post(
  "/settings",
  wrap(async (req, res) => {
    const body = req.body || {};
    const applied = {};
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_SETTINGS.has(key)) continue;
      await db.setSetting(key, value);
      applied[key] = String(value ?? "");
    }
    res.json({ ok: true, applied });
  })
);

router.get(
  "/catalog",
  wrap(async (req, res) => {
    const catalog = await shopClient.getCatalog();
    res.json({ status: shopClient.cacheStatus(), catalog });
  })
);

router.post(
  "/catalog/refresh",
  wrap(async (req, res) => {
    shopClient.clearCache();
    const catalog = await shopClient.getCatalog({ force: true });
    res.json({
      ok: true,
      status: shopClient.cacheStatus(),
      productCount: catalog ? catalog.productCount : 0,
    });
  })
);

module.exports = router;
