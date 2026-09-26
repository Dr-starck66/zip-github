INSERT INTO api_keys(id,name,key_prefix,key_hash,scopes,active)
VALUES (
  'key_initial_admin',
  'initial-admin',
  'el_live_hMUZ6f',
  '769840c4570b906892e178b4899a8b5a03a658f8a2f4224de3b6ef90e2f39093',
  '["*"]'::jsonb,
  TRUE
)
ON CONFLICT (id) DO NOTHING;
