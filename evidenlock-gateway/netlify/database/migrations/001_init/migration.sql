CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  scopes JSONB NOT NULL DEFAULT '["audit:write","audit:read","evidence:verify"]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  api_key_id TEXT REFERENCES api_keys(id),
  policy TEXT NOT NULL,
  task TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  checks JSONB NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  verdict TEXT NOT NULL CHECK (verdict IN ('PASS','PARTIAL','FAIL')),
  fingerprint TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audits_created_at_idx ON audits(created_at DESC);
CREATE INDEX IF NOT EXISTS audits_api_key_id_idx ON audits(api_key_id);

CREATE TABLE IF NOT EXISTS evidence_checks (
  id BIGSERIAL PRIMARY KEY,
  audit_id TEXT REFERENCES audits(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  final_url TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_checks_audit_id_idx ON evidence_checks(audit_id);
