-- =============================================================================
-- Delete Operations & Dynamic Role Management RPCs
-- Run this in Supabase SQL Editor to enable delete_district, delete_conductor,
-- delete_admin_user, and role modification.
-- =============================================================================

-- 1. delete_district
create or replace function public.delete_district(p_district_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can delete districts';
  end if;

  -- Gracefully unlink all entities referencing this district
  update public.profiles set district_id = null where district_id = p_district_id;
  update public.conductors set district_id = null where district_id = p_district_id;
  update public.buses set district_id = null where district_id = p_district_id;
  update public.routes set district_id = null where district_id = p_district_id;
  update public.trips set district_id = null where district_id = p_district_id;
  update public.stops set district_id = null where district_id = p_district_id;

  delete from public.districts where id = p_district_id;
  return true;
end;
$$;

-- 2. delete_conductor
create or replace function public.delete_conductor(p_conductor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_district_id uuid;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can delete conductors';
  end if;

  select user_id, district_id into v_user_id, v_district_id
  from public.conductors
  where id = p_conductor_id;

  if not found then
    raise exception 'CONDUCTOR_NOT_FOUND: Conductor record does not exist';
  end if;

  -- District admins can only delete within their own district
  if not is_master_admin() and v_district_id is not null and v_district_id is distinct from my_district_id() then
    raise exception 'FORBIDDEN: You can only delete conductors in your assigned district';
  end if;

  -- Unlink upcoming or active trips
  update public.trips set conductor_id = null where conductor_id = p_conductor_id;

  -- Unassign active ETM devices
  update public.etm_assignments
  set unassigned_at = now()
  where conductor_id = p_conductor_id and unassigned_at is null;

  -- Delete conductor record
  delete from public.conductors where id = p_conductor_id;

  -- If conductor was linked to an auth user and profile, delete them
  if v_user_id is not null then
    delete from public.profiles where id = v_user_id;
    begin
      delete from auth.users where id = v_user_id;
    exception when others then
      null;
    end;
  end if;

  return true;
end;
$$;

-- 3. delete_admin_user
create or replace function public.delete_admin_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can delete admin accounts';
  end if;

  -- Self-deletion guard
  if auth.uid() = p_user_id then
    raise exception 'INVALID_ACTION: You cannot delete your own active administrator account';
  end if;

  select role into v_target_role from public.profiles where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND: Administrator profile does not exist';
  end if;

  -- District admin cannot delete a master admin
  if not is_master_admin() and v_target_role = 'master_admin' then
    raise exception 'FORBIDDEN: District administrators cannot delete master administrators';
  end if;

  -- Delete profile
  delete from public.profiles where id = p_user_id;

  -- Delete from auth.users if possible
  begin
    delete from auth.users where id = p_user_id;
  exception when others then
    null;
  end;

  return true;
end;
$$;

-- 4. update_district_admin_profile (enhanced with role management)
create or replace function public.update_district_admin_profile(
  p_user_id      uuid,
  p_display_name text,
  p_district_id  uuid,
  p_is_active    boolean default true,
  p_role         text    default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.profiles;
  v_target_role text;
begin
  if not is_any_admin() then
    raise exception 'FORBIDDEN: Only administrators can modify admin user profiles';
  end if;

  select role into v_target_role from public.profiles where id = p_user_id;

  -- Only master admin can promote/change to master_admin or demote master_admin
  if (p_role = 'master_admin' or v_target_role = 'master_admin') and not is_master_admin() then
    raise exception 'FORBIDDEN: Only master administrators can modify master admin roles';
  end if;

  update public.profiles
  set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
      full_name    = coalesce(nullif(trim(p_display_name), ''), full_name),
      district_id  = p_district_id,
      role         = coalesce(nullif(trim(p_role), ''), role),
      status       = case when p_is_active = false then 'INACTIVE' else 'ACTIVE' end,
      updated_at   = now()
  where id = p_user_id
  returning * into v_admin;

  if not found then
    raise exception 'NOT_FOUND: Profile % not found', p_user_id;
  end if;

  return v_admin;
end;
$$;

-- 5. Update RLS policies for districts delete
drop policy if exists districts_master_delete on public.districts;
drop policy if exists districts_admin_delete on public.districts;
create policy districts_admin_delete on public.districts for delete using (is_any_admin());

-- Grants
grant execute on function public.delete_district(uuid) to authenticated, anon;
grant execute on function public.delete_conductor(uuid) to authenticated, anon;
grant execute on function public.delete_admin_user(uuid) to authenticated, anon;
grant execute on function public.update_district_admin_profile(uuid, text, uuid, boolean, text) to authenticated, anon;
