ALTER TABLE audits ADD COLUMN IF NOT EXISTS principal_type TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE audits ADD COLUMN IF NOT EXISTS principal_id TEXT;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS github_trust_policies (
  id TEXT PRIMARY KEY,
  repository TEXT UNIQUE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_events JSONB NOT NULL DEFAULT '["push","workflow_dispatch"]'::jsonb,
  required_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO github_trust_policies(id,repository,enabled,allowed_events,required_ref)
VALUES (
  'gh_zip_github',
  'Dr-starck66/zip-github',
  TRUE,
  '["push","workflow_dispatch"]'::jsonb,
  'refs/heads/main'
)
ON CONFLICT (repository) DO UPDATE SET enabled=EXCLUDED.enabled,allowed_events=EXCLUDED.allowed_events,required_ref=EXCLUDED.required_ref;
