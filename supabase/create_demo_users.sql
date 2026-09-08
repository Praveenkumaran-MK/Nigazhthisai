DO $$
DECLARE
  v_tiruppur_id uuid := '78df9c10-e663-4806-82dc-f694a3e1b70f';
  v_user_id uuid;
  v_cond1_id uuid;
BEGIN
  -- 1. Master Admin (admin@nigazhthisai.com)
  UPDATE auth.users
  SET encrypted_password = extensions.crypt('admin123', extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      phone_change = coalesce(phone_change, ''),
      phone_change_token = coalesce(phone_change_token, ''),
      reauthentication_token = coalesce(reauthentication_token, ''),
      updated_at = now()
  WHERE email = 'admin@nigazhthisai.com';

  UPDATE public.profiles
  SET role = 'master_admin', display_name = 'Master Admin', full_name = 'Master Admin', updated_at = now()
  WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@nigazhthisai.com');

  -- 2. District Admin (tiruppur@nigazhthisai.com)
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'tiruppur@nigazhthisai.com';
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      created_at, updated_at
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'tiruppur@nigazhthisai.com', extensions.crypt('admin123', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Tiruppur District Admin"}'::jsonb,
      '', '', '', '', '', '', '', '',
      now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('admin123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
        email_change_token_current = coalesce(email_change_token_current, ''),
        phone_change = coalesce(phone_change, ''),
        phone_change_token = coalesce(phone_change_token, ''),
        reauthentication_token = coalesce(reauthentication_token, ''),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (id, role, display_name, district_id, status)
  VALUES (v_user_id, 'admin', 'Tiruppur District Admin', v_tiruppur_id, 'ACTIVE')
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin', display_name = 'Tiruppur District Admin', district_id = v_tiruppur_id, status = 'ACTIVE', updated_at = now();

  -- 3. Conductor: both cond-1@conductor.internal AND conductor@nigazhthisai.com
  SELECT id INTO v_cond1_id FROM auth.users WHERE email = 'cond-1@conductor.internal';
  IF v_cond1_id IS NULL THEN
    v_cond1_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      created_at, updated_at
    ) VALUES (
      v_cond1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'cond-1@conductor.internal', extensions.crypt('conductor123', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"COND-1"}'::jsonb,
      '', '', '', '', '', '', '', '',
      now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('conductor123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
        email_change_token_current = coalesce(email_change_token_current, ''),
        phone_change = coalesce(phone_change, ''),
        phone_change_token = coalesce(phone_change_token, ''),
        reauthentication_token = coalesce(reauthentication_token, ''),
        updated_at = now()
    WHERE id = v_cond1_id;
  END IF;

  INSERT INTO public.profiles (id, role, display_name, status)
  VALUES (v_cond1_id, 'conductor', 'Conductor COND-1', 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET role = 'conductor', display_name = 'Conductor COND-1', status = 'ACTIVE', updated_at = now();

  -- Also create conductor@nigazhthisai.com
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'conductor@nigazhthisai.com';
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      created_at, updated_at
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'conductor@nigazhthisai.com', extensions.crypt('conductor123', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"COND-1"}'::jsonb,
      '', '', '', '', '', '', '', '',
      now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('conductor123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
        email_change_token_current = coalesce(email_change_token_current, ''),
        phone_change = coalesce(phone_change, ''),
        phone_change_token = coalesce(phone_change_token, ''),
        reauthentication_token = coalesce(reauthentication_token, ''),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (id, role, display_name, status)
  VALUES (v_user_id, 'conductor', 'Conductor COND-1', 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET role = 'conductor', display_name = 'Conductor COND-1', status = 'ACTIVE', updated_at = now();

  -- Upsert COND-1 into conductors table and link to conductor user
  INSERT INTO public.conductors (government_id, display_name, is_active, user_id)
  VALUES ('COND-1', 'COND-1', true, v_cond1_id)
  ON CONFLICT (government_id) DO UPDATE
    SET user_id = v_cond1_id, is_active = true;

  -- 4. Passenger (passenger@nigazhthisai.com)
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'passenger@nigazhthisai.com';
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      created_at, updated_at
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'passenger@nigazhthisai.com', extensions.crypt('passenger123', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Passenger Test"}'::jsonb,
      '', '', '', '', '', '', '', '',
      now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('passenger123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
        email_change_token_current = coalesce(email_change_token_current, ''),
        phone_change = coalesce(phone_change, ''),
        phone_change_token = coalesce(phone_change_token, ''),
        reauthentication_token = coalesce(reauthentication_token, ''),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (id, role, display_name, status)
  VALUES (v_user_id, 'passenger', 'Passenger Test', 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET role = 'passenger', status = 'ACTIVE', updated_at = now();

  -- 5. Ensure all identities exist and provider_id is the user's email
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at
  )
  SELECT
    gen_random_uuid(),
    u.id,
    u.email,
    'email',
    jsonb_build_object(
      'sub',            u.id::text,
      'email',          u.email,
      'email_verified', true,
      'phone_verified', false
    ),
    u.created_at,
    now(),
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN auth.identities i ON i.user_id = u.id AND i.provider = 'email'
  WHERE i.id IS NULL AND u.email IS NOT NULL;

END $$;
