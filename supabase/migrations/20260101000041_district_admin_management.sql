-- Migration: 20260101000041_district_admin_management.sql
-- Description: RPC for Master Admin to dynamically create district administrators

create or replace function create_district_admin_user(
  p_email        text,
  p_password     text,
  p_display_name text,
  p_phone        text default null,
  p_district_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
  v_encrypted_pw text;
begin
  if not is_master_admin() then
    raise exception 'FORBIDDEN: only master administrators can create district admins';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'INVALID_ARGUMENT: Email is required';
  end if;

  if p_password is null or length(p_password) < 6 then
    raise exception 'INVALID_ARGUMENT: Password must be at least 6 characters';
  end if;

  -- Check if user already exists
  select id into v_user_id from auth.users where email = lower(trim(p_email));
  if v_user_id is not null then
    -- Update existing profile to admin
    update public.profiles
    set role = 'admin',
        display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
        full_name = coalesce(nullif(trim(p_display_name), ''), full_name),
        phone = coalesce(nullif(trim(p_phone), ''), phone),
        district_id = p_district_id,
        status = 'ACTIVE',
        updated_at = now()
    where id = v_user_id;

    return jsonb_build_object('success', true, 'user_id', v_user_id, 'mode', 'promoted_existing');
  end if;

  -- Generate new user id and encrypted password
  v_user_id := gen_random_uuid();
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  -- Insert into auth.users
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    lower(trim(p_email)),
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', trim(p_display_name), 'role', 'admin'),
    now(),
    now()
  );

  -- Upsert profile
  insert into public.profiles (
    id,
    role,
    display_name,
    full_name,
    phone,
    district_id,
    status,
    created_at,
    updated_at
  ) values (
    v_user_id,
    'admin',
    trim(p_display_name),
    trim(p_display_name),
    nullif(trim(p_phone), ''),
    p_district_id,
    'ACTIVE',
    now(),
    now()
  )
  on conflict (id) do update
  set role = 'admin',
      display_name = excluded.display_name,
      full_name = excluded.full_name,
      phone = excluded.phone,
      district_id = excluded.district_id,
      status = 'ACTIVE',
      updated_at = now();

  return jsonb_build_object('success', true, 'user_id', v_user_id, 'mode', 'created');
end;
$$;
