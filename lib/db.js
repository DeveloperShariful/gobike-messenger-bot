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

// --------------------------------------------------------------------------
// Conversation history
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// Human handoff queue
// --------------------------------------------------------------------------

async function logHandoff({ platform, senderId, reason, lastMessage }) {
  await pool.query(
    `INSERT INTO bot_handoffs (platform, sender_id, reason, last_message)
     VALUES ($1, $2, $3, $4)`,
    [platform, senderId, reason, lastMessage]
  );
}

async function listHandoffs({ resolved = false, limit = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, platform, sender_id, reason, last_message, created_at, resolved
     FROM bot_handoffs
     WHERE resolved = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [resolved, limit]
  );
  return rows;
}

async function resolveHandoff(id) {
  await pool.query(`UPDATE bot_handoffs SET resolved = true WHERE id = $1`, [id]);
}

// --------------------------------------------------------------------------
// Dashboard: conversation browsing + stats
// --------------------------------------------------------------------------

async function listRecentSenders({ limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT platform, sender_id,
            MAX(created_at)                          AS last_at,
            COUNT(*)                                 AS message_count,
            (ARRAY_AGG(content ORDER BY created_at DESC))[1] AS last_message
     FROM bot_conversations
     GROUP BY platform, sender_id
     ORDER BY last_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ ...r, message_count: Number(r.message_count) }));
}

async function getThread({ platform, senderId, limit = 100 }) {
  const { rows } = await pool.query(
    `SELECT role, content, created_at FROM bot_conversations
     WHERE platform = $1 AND sender_id = $2
     ORDER BY created_at ASC
     LIMIT $3`,
    [platform, senderId, limit]
  );
  return rows;
}

async function getStats() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM bot_conversations
         WHERE created_at > now() - interval '24 hours')              AS messages_24h,
      (SELECT COUNT(*) FROM bot_conversations
         WHERE created_at > now() - interval '7 days')                AS messages_7d,
      (SELECT COUNT(DISTINCT sender_id) FROM bot_conversations
         WHERE created_at > now() - interval '7 days')                AS customers_7d,
      (SELECT COUNT(DISTINCT sender_id) FROM bot_conversations)       AS customers_total,
      (SELECT COUNT(*) FROM bot_handoffs WHERE resolved = false)      AS open_handoffs,
      (SELECT COUNT(*) FROM bot_handoffs)                             AS total_handoffs
  `);
  const r = rows[0] || {};
  // pg returns bigint counts as strings — coerce to numbers for the UI
  return Object.fromEntries(
    Object.entries(r).map(([k, v]) => [k, Number(v)])
  );
}

// Which of the bot's tables actually exist — so the dashboard can show a
// clear "run sql/schema.sql" message instead of a blank screen.
async function checkSetup() {
  const want = ["bot_conversations", "bot_handoffs", "bot_settings"];
  const result = { connected: false, tables: {}, ready: false };
  try {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [want]
    );
    const present = new Set(rows.map((r) => r.table_name));
    result.connected = true;
    for (const t of want) result.tables[t] = present.has(t);
    result.ready = want.every((t) => present.has(t));
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

// --------------------------------------------------------------------------
// Settings (bot_settings key/value table)
// --------------------------------------------------------------------------

async function getSetting(key, fallback = null) {
  const { rows } = await pool.query(
    `SELECT value FROM bot_settings WHERE key = $1`,
    [key]
  );
  return rows[0] ? rows[0].value : fallback;
}

async function getAllSettings() {
  const { rows } = await pool.query(`SELECT key, value FROM bot_settings`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO bot_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, String(value ?? "")]
  );
}

module.exports = {
  pool,
  saveMessage,
  getRecentHistory,
  logHandoff,
  listHandoffs,
  resolveHandoff,
  listRecentSenders,
  getThread,
  getStats,
  checkSetup,
  getSetting,
  getAllSettings,
  setSetting,
};
