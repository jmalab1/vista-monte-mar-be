CREATE TABLE IF NOT EXISTS app_kv_versions (
  id BIGSERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  key TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  before_value JSONB,
  after_value JSONB,
  before_checksum TEXT,
  after_checksum TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_kv_versions_key_created_at
  ON app_kv_versions (key, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  target TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_action_created_at
  ON audit_events (action, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_security_events (
  id BIGSERIAL PRIMARY KEY,
  username TEXT,
  ip TEXT,
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_security_events_user_ip_created_at
  ON auth_security_events (username, ip, created_at DESC);

