/**
 * Tiny in-memory rate limiter — no dependencies, fine for a single Render
 * instance. Fixed window per key (client IP). If you scale to multiple
 * instances, swap this for a Redis-backed limiter.
 */
function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map(); // key -> { count, resetAt }

  // Periodic cleanup so the map doesn't grow forever.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
  }, windowMs);
  if (timer.unref) timer.unref();

  return function rateLimit(req, res, next) {
    const key =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "unknown";
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retry = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retry));
      return res.status(429).send(message || "Too many requests. Slow down.");
    }
    next();
  };
}

module.exports = { createRateLimiter };
