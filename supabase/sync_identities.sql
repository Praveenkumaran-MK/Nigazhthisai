-- Sync/insert identities for all users with provider = 'email'
-- Note: 'email' in auth.identities is a GENERATED column from identity_data->>'email', so we only populate identity_data.
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', lower(u.email)),
  'email',
  u.id::text,
  now(),
  now(),
  now()
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
  );

-- Update identity_data for existing identities to match current email in auth.users
UPDATE auth.identities i
SET identity_data = jsonb_build_object('sub', u.id::text, 'email', lower(u.email)),
    updated_at = now()
FROM auth.users u
WHERE i.user_id = u.id AND i.provider = 'email';
