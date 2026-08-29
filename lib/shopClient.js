/**
 * Client for the my-shop store's read-only internal bot API
 * (https://gobike.au/api/bot/*). Server-to-server, authenticated with a
 * shared secret in the `x-api-key` header.
 *
 * Everything here degrades gracefully: if the store is unreachable, catalog
 * calls fall back to the last good response (or null) so the bot keeps
 * working off its static knowledge base instead of crashing.
 */

const BASE_URL = (process.env.SHOP_API_BASE_URL || "https://gobike.au").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.BOT_API_KEY || "";
const TIMEOUT_MS = Number(process.env.SHOP_API_TIMEOUT_MS || 8000);

const CATALOG_TTL_MS = 10 * 60 * 1000; // 10 minutes
const POLICIES_TTL_MS = 30 * 60 * 1000; // 30 minutes

const cache = {
  catalog: { data: null, at: 0 },
  policies: { data: null, at: 0 },
};

async function request(path, { method = "GET", body } = {}) {
  if (!API_KEY) {
    throw new Error("BOT_API_KEY is not set — cannot call the store API.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "x-api-key": API_KEY,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: text };
    }
    if (!res.ok) {
      const err = new Error(
        `Store API ${path} responded ${res.status}: ${json.error || text}`
      );
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live product catalogue. Cached ~10 min. On failure, returns the last good
 * copy if we have one, otherwise null (caller should fall back to static KB).
 */
async function getCatalog({ force = false } = {}) {
  const fresh = Date.now() - cache.catalog.at < CATALOG_TTL_MS;
  if (!force && fresh && cache.catalog.data) return cache.catalog.data;

  try {
    const data = await request("/api/bot/catalog");
    cache.catalog = { data, at: Date.now() };
    return data;
  } catch (err) {
    console.error("[shopClient] getCatalog failed:", err.message);
    return cache.catalog.data || null;
  }
}

/** Store contact details + general config. Cached ~30 min. */
async function getPolicies({ force = false } = {}) {
  const fresh = Date.now() - cache.policies.at < POLICIES_TTL_MS;
  if (!force && fresh && cache.policies.data) return cache.policies.data;

  try {
    const data = await request("/api/bot/policies");
    cache.policies = { data, at: Date.now() };
    return data;
  } catch (err) {
    console.error("[shopClient] getPolicies failed:", err.message);
    return cache.policies.data || null;
  }
}

/**
 * Order status lookup. Never cached. Throws on transport failure so the
 * caller (the order-lookup tool) can tell the model to apologise + escalate.
 *
 * Returns one of:
 *   { found: false }
 *   { found: true, needsVerification: true }
 *   { found: true, orderNumber, status, ..., shipping: {...} }
 */
async function getOrder({ orderNumber, email }) {
  return request("/api/bot/order", {
    method: "POST",
    body: { orderNumber, email: email || undefined },
  });
}

/** Drop cached catalogue + policies (used by the dashboard "refresh" button). */
function clearCache() {
  cache.catalog = { data: null, at: 0 };
  cache.policies = { data: null, at: 0 };
}

function cacheStatus() {
  return {
    catalogAgeMs: cache.catalog.at ? Date.now() - cache.catalog.at : null,
    catalogLoaded: Boolean(cache.catalog.data),
    policiesAgeMs: cache.policies.at ? Date.now() - cache.policies.at : null,
    policiesLoaded: Boolean(cache.policies.data),
    baseUrl: BASE_URL,
  };
}

module.exports = {
  getCatalog,
  getPolicies,
  getOrder,
  clearCache,
  cacheStatus,
};
