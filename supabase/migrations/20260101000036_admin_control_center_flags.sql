-- =============================================================================
-- 036: Admin Control Center Feature Flags
--
-- Enables Master Admin to grant or revoke accessibility of specific modules
-- for normal/district admins. Persisted in DB, realtime synchronized, and 
-- strictly protected by Master Admin authorization.
-- =============================================================================

create table if not exists public.system_feature_flags (
  feature_key text primary key,
  display_name text not null,
  description text,
  is_enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id) on delete set null
);

-- Enable Row Level Security
alter table public.system_feature_flags enable row level security;

-- All users (authenticated and anon) can read flags so apps can adapt dynamically
drop policy if exists "system_feature_flags_read_all" on public.system_feature_flags;
create policy "system_feature_flags_read_all"
  on public.system_feature_flags
  for select
  using (true);

-- Only Master Admin can insert, update, or delete feature flags
drop policy if exists "system_feature_flags_master_write" on public.system_feature_flags;
create policy "system_feature_flags_master_write"
  on public.system_feature_flags
  for all
  to authenticated
  using (is_master_admin())
  with check (is_master_admin());

-- Seed the 10 core administrative modules
insert into public.system_feature_flags (feature_key, display_name, description, is_enabled)
values
  ('dashboard', 'Dashboard', 'District overview, operational metrics and command hero', true),
  ('live_monitoring', 'Live Monitoring', 'Real-time GPS bus tracking and live fleet radar', true),
  ('revenue_analytics', 'Revenue Analytics', 'District revenue reports, fare analytics and collections', true),
  ('operations_module', 'Operations Module', 'Stop management, fares configuration and conductor directory', true),
  ('buses_management', 'Buses Management', 'Fleet bus registration, capacity and status', true),
  ('routes_management', 'Routes Management', 'Route patterns, stop ordering and path geometry', true),
  ('trips_management', 'Trips Management', 'Daily trip dispatches, assignments and day-wise schedules', true),
  ('operational_alerts', 'Operational Alerts', 'SOS response center, idle alerts and incident resolution', true),
  ('shops_management', 'Shops Management', 'ETM devices, maintenance workshop and bus QR codes', true),
  ('support_faq', 'Support & FAQ', 'Passenger complaints desk, grievance tickets and user queries', true)
on conflict (feature_key) do update
set display_name = excluded.display_name,
    description = excluded.description;

-- RPC to toggle feature flag safely
create or replace function public.toggle_feature_flag(
  p_feature_key text,
  p_is_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flag public.system_feature_flags%rowtype;
begin
  if not is_master_admin() then
    raise exception 'Unauthorized: Only Master Admin has authority to toggle feature accessibility';
  end if;

  update public.system_feature_flags
  set is_enabled = p_is_enabled,
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where feature_key = p_feature_key
  returning * into v_flag;

  if not found then
    insert into public.system_feature_flags (feature_key, display_name, is_enabled, updated_at, updated_by)
    values (p_feature_key, upper(replace(p_feature_key, '_', ' ')), p_is_enabled, timezone('utc', now()), auth.uid())
    returning * into v_flag;
  end if;

  return to_jsonb(v_flag);
end;
$$;

grant execute on function public.toggle_feature_flag(text, boolean) to authenticated;

-- Add to Realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'system_feature_flags'
  ) then
    alter publication supabase_realtime add table public.system_feature_flags;
  end if;
end;
$$;
