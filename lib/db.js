const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Most managed Postgres providers (Render, Railway, Supabase, RDS...)
  // need SSL. Turn this off only if you're sure your DB doesn't need it.
  ssl:
    process.env.DATABASE_SSL === "false"
      ? false
      : { rejectUnauthorized: false },
});

// Only allow safe identifier characters through, since these table/column
// names come from env vars and get interpolated into SQL (Postgres won't
// let you parametrize identifiers the way it does values).
function safeIdent(name, fallback) {
  const value = (name || fallback || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(
      `Invalid/unsafe identifier in env config: "${name}". Use only letters, numbers, underscores.`
    );
  }
  return value;
}

const ORDERS_TABLE = safeIdent(process.env.ORDERS_TABLE, "orders");
const COL_ORDER_NUMBER = safeIdent(
  process.env.ORDERS_ORDER_NUMBER_COLUMN,
  "order_number"
);
const COL_STATUS = safeIdent(process.env.ORDERS_STATUS_COLUMN, "status");
const COL_TRACKING = safeIdent(
  process.env.ORDERS_TRACKING_COLUMN,
  "tracking_number"
);
const COL_CARRIER = safeIdent(process.env.ORDERS_CARRIER_COLUMN, "carrier");
const COL_ETA = safeIdent(
  process.env.ORDERS_ETA_COLUMN,
  "estimated_delivery"
);

/**
 * Looks up an order by order number against YOUR orders table/view.
 * See sql/schema.sql for how to point this at your real schema without
 * renaming anything.
 */
async function lookupOrderStatus(orderNumber) {
  const query = `
    SELECT
      ${COL_ORDER_NUMBER} AS order_number,
      ${COL_STATUS} AS status,
      ${COL_TRACKING} AS tracking_number,
      ${COL_CARRIER} AS carrier,
      ${COL_ETA} AS estimated_delivery
    FROM ${ORDERS_TABLE}
    WHERE ${COL_ORDER_NUMBER} ILIKE $1
    LIMIT 1
  `;
  // Accept "#GB-10234", "gb-10234", etc. by stripping a leading # and
  // trimming whitespace before matching.
  const cleaned = String(orderNumber || "").replace(/^#/, "").trim();
  const { rows } = await pool.query(query, [cleaned]);
  return rows[0] || null;
}

async function saveMessage({ platform, senderId, role, content }) {
  await pool.query(
    `INSERT INTO bot_conversations (platform, sender_id, role, content)
     VALUES ($1, $2, $3, $4)`,
    [platform, senderId, role, content]
  );
}

async function getRecentHistory({ platform, senderId, limit = 12 }) {
  const { rows } = await pool.query(
    `SELECT role, content FROM bot_conversations
     WHERE platform = $1 AND sender_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [platform, senderId, limit]
  );
  return rows.reverse(); // oldest first, for Claude's messages array
}

async function logHandoff({ platform, senderId, reason, lastMessage }) {
  await pool.query(
    `INSERT INTO bot_handoffs (platform, sender_id, reason, last_message)
     VALUES ($1, $2, $3, $4)`,
    [platform, senderId, reason, lastMessage]
  );
}

module.exports = {
  pool,
  lookupOrderStatus,
  saveMessage,
  getRecentHistory,
  logHandoff,
};
