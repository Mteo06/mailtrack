/**
 * DB Migration — run: node src/models/migrate.js
 * All tables use IF NOT EXISTS — safe to re-run.
 */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
-- Users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  password_hash TEXT,
  google_id     TEXT UNIQUE,
  google_tokens JSONB,
  plan          TEXT NOT NULL DEFAULT 'free',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User settings (GDPR controls)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tracking_enabled     BOOLEAN NOT NULL DEFAULT false,
  ip_anonymization     BOOLEAN NOT NULL DEFAULT true,
  data_retention_days  INT     NOT NULL DEFAULT 365,
  notify_on_open       BOOLEAN NOT NULL DEFAULT true,
  notify_on_click      BOOLEAN NOT NULL DEFAULT true,
  webhook_url          TEXT,
  webhook_secret       TEXT,
  slack_webhook_url    TEXT,
  telegram_chat_id     TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracked emails
CREATE TABLE IF NOT EXISTS tracked_emails (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gmail_message_id TEXT,
  gmail_thread_id  TEXT,
  subject          TEXT,
  recipient_email  TEXT,
  tracking_enabled BOOLEAN NOT NULL DEFAULT true,
  status           TEXT NOT NULL DEFAULT 'sent',
  open_count       INT  NOT NULL DEFAULT 0,
  click_count      INT  NOT NULL DEFAULT 0,
  first_opened_at  TIMESTAMPTZ,
  last_opened_at   TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Open events
CREATE TABLE IF NOT EXISTS open_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id      UUID NOT NULL REFERENCES tracked_emails(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address    INET,
  ip_anonymized BOOLEAN NOT NULL DEFAULT true,
  user_agent    TEXT,
  device_type   TEXT,
  os            TEXT,
  browser       TEXT,
  country       TEXT,
  is_bot        BOOLEAN NOT NULL DEFAULT false,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracked links
CREATE TABLE IF NOT EXISTS tracked_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id     UUID NOT NULL REFERENCES tracked_emails(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_url TEXT NOT NULL,
  click_count  INT  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Click events
CREATE TABLE IF NOT EXISTS click_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id       UUID NOT NULL REFERENCES tracked_links(id) ON DELETE CASCADE,
  email_id      UUID NOT NULL REFERENCES tracked_emails(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address    INET,
  ip_anonymized BOOLEAN NOT NULL DEFAULT true,
  user_agent    TEXT,
  device_type   TEXT,
  country       TEXT,
  is_bot        BOOLEAN NOT NULL DEFAULT false,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  payload      JSONB,
  status_code  INT,
  success      BOOLEAN,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log (GDPR compliance)
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  details     JSONB,
  ip_address  TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tracked_emails_user   ON tracked_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_emails_thread ON tracked_emails(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_open_events_email     ON open_events(email_id);
CREATE INDEX IF NOT EXISTS idx_click_events_email    ON click_events(email_id);
CREATE INDEX IF NOT EXISTS idx_click_events_link     ON click_events(link_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user        ON audit_log(user_id);
`;

(async () => {
  const client = await pool.connect();
  try {
    console.log('Running migrations...');
    await client.query(sql);
    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
