const crypto = require("crypto");

const USER = process.env.DASHBOARD_USER || "";
const PASS = process.env.DASHBOARD_PASSWORD || "";

// Secret for signing the session cookie. Prefer an explicit SESSION_SECRET;
// otherwise derive one from the password so it works with no extra config
// (changing the password then invalidates old sessions, which is fine).
const SECRET =
  process.env.SESSION_SECRET ||
  (PASS
    ? crypto.createHash("sha256").update(`gobike-admin::${PASS}`).digest("hex")
    : "");

const COOKIE = "gobike_admin";
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

function configured() {
  return Boolean(USER && PASS);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// -------- signed session token: "<exp>.<hmac>" --------

function signPayload(payload) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function makeToken() {
  const payload = String(Date.now() + MAX_AGE_MS);
  return `${payload}.${signPayload(payload)}`;
}

function tokenValid(token) {
  if (!token || !SECRET) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, signPayload(payload))) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

function parseCookies(req) {
  const raw = req.get("cookie") || "";
  const out = {};
  raw.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx < 0) return;
    const key = pair.slice(0, idx).trim();
    if (key) out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  return tokenValid(parseCookies(req)[COOKIE]);
}

function cookieHeader(req, value, maxAgeSec) {
  const parts = [
    `${COOKIE}=${value}`,
    `Max-Age=${maxAgeSec}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  // Render terminates TLS at the proxy; with "trust proxy" set, req.protocol
  // reflects the original scheme.
  if (req.protocol === "https") parts.push("Secure");
  return parts.join("; ");
}

// -------- middleware --------

/** Gate for the dashboard HTML page: 503 if unconfigured, redirect to /login if signed out. */
function requirePage(req, res, next) {
  if (!configured()) {
    return res
      .status(503)
      .send(
        "Dashboard is not configured. Set DASHBOARD_USER and DASHBOARD_PASSWORD."
      );
  }
  if (isAuthed(req)) return next();
  return res.redirect(302, "/login");
}

/** Gate for the admin API: 503 if unconfigured, 401 JSON if signed out. */
function requireApi(req, res, next) {
  if (!configured()) {
    return res.status(503).json({ error: "dashboard_not_configured" });
  }
  if (isAuthed(req)) return next();
  return res.status(401).json({ error: "auth_required" });
}

// -------- handlers --------

function handleLogin(req, res) {
  if (!configured()) {
    return res.status(503).json({ error: "dashboard_not_configured" });
  }
  const username = (req.body && req.body.username) || "";
  const password = (req.body && req.body.password) || "";
  // Evaluate both sides regardless, so timing doesn't leak which was wrong.
  const okUser = safeEqual(username, USER);
  const okPass = safeEqual(password, PASS);
  if (!okUser || !okPass) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  res.set("Set-Cookie", cookieHeader(req, makeToken(), Math.floor(MAX_AGE_MS / 1000)));
  return res.json({ ok: true });
}

function handleLogout(req, res) {
  res.set("Set-Cookie", cookieHeader(req, "", 0));
  return res.json({ ok: true });
}

module.exports = {
  requirePage,
  requireApi,
  handleLogin,
  handleLogout,
  configured,
};
