-- Run this once against your PostgreSQL database (the same DATABASE_URL
-- the bot uses) before going live: psql "$DATABASE_URL" -f sql/schema.sql

-- Stores recent conversation turns per customer so the bot has context
-- across messages. This is bot-owned; it does not touch your existing
-- store/order tables.
CREATE TABLE IF NOT EXISTS bot_conversations (
  id          BIGSERIAL PRIMARY KEY,
  platform    TEXT NOT NULL,             -- 'messenger' or 'instagram'
  sender_id   TEXT NOT NULL,             -- the PSID/IGSID Meta gives you
  role        TEXT NOT NULL,             -- 'user' or 'assistant'
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_conversations_sender_idx
  ON bot_conversations (platform, sender_id, created_at);

-- Optional: log every time the bot hands a conversation off to a human,
-- so you have a queue to work through instead of only relying on email.
CREATE TABLE IF NOT EXISTS bot_handoffs (
  id          BIGSERIAL PRIMARY KEY,
  platform    TEXT NOT NULL,
  sender_id   TEXT NOT NULL,
  reason      TEXT,
  last_message TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved    BOOLEAN NOT NULL DEFAULT false
);

-- Per-conversation pause. When the bot hands a thread to a human (or a
-- human replies from the Business Suite inbox), a row goes in here and the
-- bot stays quiet on that thread. The pause lapses on its own after
-- BOT_RESUME_AFTER_MINUTES (checked in code), so no cleanup job is needed.
CREATE TABLE IF NOT EXISTS bot_thread_pauses (
  platform    TEXT NOT NULL,
  sender_id   TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  paused_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, sender_id)
);

-- Click-to-Messenger ad context. When a customer arrives by clicking a
-- Facebook/Instagram ad, Meta sends a referral (ad id, ref param, ad title).
-- We stash the latest one per thread so the bot knows which product/offer the
-- customer is asking about ("what's the weight limit for THIS bike").
CREATE TABLE IF NOT EXISTS bot_thread_referrals (
  platform    TEXT NOT NULL,
  sender_id   TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT '',   -- ADS / SHORTLINK / CUSTOMER_CHAT_PLUGIN
  ref         TEXT NOT NULL DEFAULT '',   -- your own ref param on the ad link
  ad_id       TEXT NOT NULL DEFAULT '',
  ad_title    TEXT NOT NULL DEFAULT '',   -- ads_context_data.ad_title, when Meta sends it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, sender_id)
);

-- Key/value settings the owner controls from the dashboard: the global
-- on/off switch, the extra knowledge-base text, and the message sent while
-- the bot is switched off.
CREATE TABLE IF NOT EXISTS bot_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO bot_settings (key, value) VALUES
  ('bot_enabled', 'true'),
  ('kb_override', ''),
  ('offline_message', 'Thanks for your message! Our team will get back to you as soon as we can.')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- ORDER LOOKUP: this bot expects to be able to run, roughly,
--   SELECT status, tracking_number, carrier, estimated_delivery
--   FROM orders WHERE order_number = $1
-- against YOUR real orders table (from your custom PostgreSQL system).
--
-- You almost certainly already have an orders table with different
-- column names. Rather than renaming your real table, either:
--
--   (a) set the ORDERS_* column-name env vars in .env to match your real
--       table exactly (see lib/db.js), or
--
--   (b) create a small view that maps your real schema onto the names
--       the bot expects, e.g.:
--
-- CREATE OR REPLACE VIEW bot_order_view AS
--   SELECT
--     o.order_number        AS order_number,
--     o.fulfillment_status  AS status,
--     o.tracking_number     AS tracking_number,
--     o.shipping_carrier    AS carrier,
--     o.eta_date            AS estimated_delivery,
--     o.customer_email      AS customer_email
--   FROM your_real_orders_table o;
--
-- ...then set ORDERS_TABLE=bot_order_view in .env. This keeps the bot
-- fully decoupled from your real schema, which is safer if that schema
-- changes later.
-- ---------------------------------------------------------------------
