-- 邮件订阅与投递状态；时间均为 Unix 毫秒。 / Mail subscription and delivery state; all times are Unix milliseconds.
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  locale TEXT NOT NULL CHECK (locale IN ('zh', 'en')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  confirm_token_hash TEXT UNIQUE,
  confirm_expires_at INTEGER,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((status = 'pending') = (confirm_token_hash IS NOT NULL AND confirm_expires_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS subscribers_pending_token ON subscribers(confirm_token_hash) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS subscribers_confirmed ON subscribers(status) WHERE status = 'confirmed';

-- 活动 ID 是 CI 提供的稳定幂等键。 / Campaign ID is a stable idempotency key supplied by CI.
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'complete')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- `unknown` 表示发送结果不明，禁止自动重试；需人工核对后处理。
-- `unknown` means ambiguous send outcome: do not retry automatically; reconcile manually.
CREATE TABLE IF NOT EXISTS deliveries (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  email TEXT NOT NULL REFERENCES subscribers(email),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'unknown', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at INTEGER NOT NULL,
  lease_expires_at INTEGER,
  sent_at INTEGER,
  last_error TEXT,
  PRIMARY KEY (campaign_id, email)
);

CREATE INDEX IF NOT EXISTS deliveries_ready ON deliveries(status, available_at);
CREATE INDEX IF NOT EXISTS deliveries_stale ON deliveries(lease_expires_at) WHERE status = 'sending';
