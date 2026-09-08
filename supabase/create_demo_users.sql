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
      updated_at = now()
  WHERE email = 'admin@nigazhthisai.com';

  UPDATE public.profiles
  SET role = 'master_admin', updated_at = now()
  WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@nigazhthisai.com');

  -- 2. District Admin (tiruppur@nigazhthisai.com)
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'tiruppur@nigazhthisai.com';
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'tiruppur@nigazhthisai.com', extensions.crypt('admin123', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Tiruppur Admin"}'::jsonb, now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('admin123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (id, role, display_name, district_id, status)
  VALUES (v_user_id, 'admin', 'Tiruppur Admin', v_tiruppur_id, 'ACTIVE')
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin', district_id = v_tiruppur_id, status = 'ACTIVE', updated_at = now();

  -- 3. Conductor: both cond-1@conductor.internal AND conductor@nigazhthisai.com
  SELECT id INTO v_cond1_id FROM auth.users WHERE email = 'cond-1@conductor.internal';
  IF v_cond1_id IS NULL THEN
    v_cond1_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_cond1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'cond-1@conductor.internal', extensions.crypt('conductor123', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"COND-1"}'::jsonb, now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('conductor123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_cond1_id;
  END IF;

  INSERT INTO public.profiles (id, role, display_name, status)
  VALUES (v_cond1_id, 'conductor', 'COND-1', 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET role = 'conductor', status = 'ACTIVE', updated_at = now();

  -- Also create conductor@nigazhthisai.com
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'conductor@nigazhthisai.com';
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'conductor@nigazhthisai.com', extensions.crypt('conductor123', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"COND-1"}'::jsonb, now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('conductor123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (id, role, display_name, status)
  VALUES (v_user_id, 'conductor', 'COND-1', 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET role = 'conductor', status = 'ACTIVE', updated_at = now();

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
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'passenger@nigazhthisai.com', extensions.crypt('passenger123', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Passenger Test"}'::jsonb, now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('passenger123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (id, role, display_name, status)
  VALUES (v_user_id, 'passenger', 'Passenger Test', 'ACTIVE')
  ON CONFLICT (id) DO UPDATE SET role = 'passenger', status = 'ACTIVE', updated_at = now();

END $$;
