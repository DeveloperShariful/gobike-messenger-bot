const fs = require("fs");
const path = require("path");
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

/**
 * Runs sql/schema.sql on startup so the bot creates its own tables
 * (bot_conversations / bot_handoffs / bot_settings) automatically — no
 * manual psql step. The script is idempotent (CREATE TABLE IF NOT EXISTS +
 * INSERT ... ON CONFLICT DO NOTHING), so it's safe to run every boot.
 * Only ever creates bot_* tables — never touches anything else in the DB.
 */
async function runMigrations() {
  const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
}

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
  // Don't stack duplicates: if this thread already has an unresolved handoff
  // from the last few hours, leave it be (the bot can re-escalate after an
  // auto-resume, and we don't want the queue filling with the same person).
  const { rows } = await pool.query(
    `SELECT 1 FROM bot_handoffs
     WHERE platform = $1 AND sender_id = $2 AND resolved = false
       AND created_at > now() - interval '6 hours'
     LIMIT 1`,
    [platform, senderId]
  );
  if (rows.length) return false;
  await pool.query(
    `INSERT INTO bot_handoffs (platform, sender_id, reason, last_message)
     VALUES ($1, $2, $3, $4)`,
    [platform, senderId, reason, lastMessage]
  );
  return true; // a genuinely new handoff (caller can notify the team)
}

// --------------------------------------------------------------------------
// Per-conversation pause (bot stays quiet while a human handles a thread)
// --------------------------------------------------------------------------

async function pauseThread({ platform, senderId, reason = "" }) {
  await pool.query(
    `INSERT INTO bot_thread_pauses (platform, sender_id, reason, paused_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (platform, sender_id)
     DO UPDATE SET reason = EXCLUDED.reason, paused_at = now()`,
    [platform, senderId, reason]
  );
}

async function resumeThread({ platform, senderId }) {
  await pool.query(
    `DELETE FROM bot_thread_pauses WHERE platform = $1 AND sender_id = $2`,
    [platform, senderId]
  );
}

/**
 * True if the bot should stay silent on this thread right now. The pause
 * auto-expires after resumeAfterMinutes; when it has, we delete the row and
 * return false so the bot picks the conversation back up on its own.
 */
async function isThreadPaused({ platform, senderId, resumeAfterMinutes = 10 }) {
  const { rows } = await pool.query(
    `SELECT paused_at FROM bot_thread_pauses
     WHERE platform = $1 AND sender_id = $2`,
    [platform, senderId]
  );
  if (!rows.length) return false;
  const ageMin = (Date.now() - new Date(rows[0].paused_at).getTime()) / 60000;
  if (ageMin >= resumeAfterMinutes) {
    await resumeThread({ platform, senderId }).catch(() => {});
    return false;
  }
  return true;
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
  runMigrations,
  saveMessage,
  getRecentHistory,
  logHandoff,
  listHandoffs,
  resolveHandoff,
  pauseThread,
  resumeThread,
  isThreadPaused,
  listRecentSenders,
  getThread,
  getStats,
  checkSetup,
  getSetting,
  getAllSettings,
  setSetting,
};
