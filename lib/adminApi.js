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

router.get(
  "/stats",
  wrap(async (req, res) => {
    res.json(await db.getStats());
  })
);

router.get(
  "/handoffs",
  wrap(async (req, res) => {
    const resolved = req.query.resolved === "true";
    res.json(await db.listHandoffs({ resolved }));
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
    res.json(await db.listRecentSenders({ limit: 60 }));
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
    res.json(await db.getAllSettings());
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
