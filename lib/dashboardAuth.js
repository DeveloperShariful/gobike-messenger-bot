const crypto = require("crypto");

const USER = process.env.DASHBOARD_USER || "";
const PASS = process.env.DASHBOARD_PASSWORD || "";

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * HTTP Basic Auth for the dashboard + its admin API. Fails closed: if
 * DASHBOARD_USER / DASHBOARD_PASSWORD aren't set, the dashboard is disabled.
 */
function dashboardAuth(req, res, next) {
  if (!USER || !PASS) {
    return res
      .status(503)
      .send(
        "Dashboard is not configured. Set DASHBOARD_USER and DASHBOARD_PASSWORD."
      );
  }

  const header = req.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    if (safeEqual(user, USER) && safeEqual(pass, PASS)) {
      return next();
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="GoBike bot dashboard", charset="UTF-8"');
  return res.status(401).send("Authentication required.");
}

module.exports = { dashboardAuth };
