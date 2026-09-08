-- =============================================================================
-- Migration: Ensure auth.identities.provider_id matches email for email provider
-- This prevents "Database error querying schema" on GoTrue sign-in
-- for accounts that were seeded with UUID as provider_id
-- =============================================================================

UPDATE auth.identities
SET
  provider_id   = u.email,
  identity_data = jsonb_build_object(
    'sub',            u.id::text,
    'email',          u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  updated_at = now()
FROM auth.users u
WHERE auth.identities.user_id = u.id
  AND auth.identities.provider = 'email'
  AND auth.identities.provider_id <> u.email
  AND u.email IS NOT NULL;

-- GoTrue's database scanner expects empty strings rather than NULL for auth token columns;
-- otherwise it throws "Database error querying schema" during signInWithPassword
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '');

