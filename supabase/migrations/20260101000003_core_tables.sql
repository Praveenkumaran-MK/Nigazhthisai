-- =============================================================================
-- 003: Core reference tables — stops, routes, route_stops, fare_matrix, buses,
-- conductors, profiles (role mapping), transport_authority_config
-- =============================================================================

-- Generic updated_at trigger function, reused by every table below.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: maps a Supabase auth.users identity to an application role.
-- Created automatically for every new auth user via trigger (see below).
-- -----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'passenger',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile row whenever a new Supabase auth user is created.
-- Role defaults to 'passenger' and must be promoted explicitly by an admin
-- (or by the conductor-provisioning RPC) — never inferred from client input.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (new.id, 'passenger', new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- stops
-- -----------------------------------------------------------------------------
create table stops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  district text not null,
  location geography(point, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger stops_set_updated_at
  before update on stops
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- routes
-- -----------------------------------------------------------------------------
create table routes (
  id uuid primary key default gen_random_uuid(),
  route_number text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger routes_set_updated_at
  before update on routes
  for each row execute function set_updated_at();

-- route_stops: normalized ordered relationship (preferred over a raw
-- stop_ids array so sequence_order can be indexed, constrained, and
-- referenced by trip_stops/fare lookups without re-parsing an array).
create table route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes (id) on delete cascade,
  stop_id uuid not null references stops (id) on delete restrict,
  sequence_order int not null,
  unique (route_id, sequence_order),
  unique (route_id, stop_id)
);

-- -----------------------------------------------------------------------------
-- fare_matrix
-- -----------------------------------------------------------------------------
create table fare_matrix (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes (id) on delete cascade,
  origin_stop_id uuid not null references stops (id) on delete restrict,
  dest_stop_id uuid not null references stops (id) on delete restrict,
  flat_fare_amount numeric(10, 2) not null check (flat_fare_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, origin_stop_id, dest_stop_id),
  check (origin_stop_id <> dest_stop_id)
);

create trigger fare_matrix_set_updated_at
  before update on fare_matrix
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- buses
-- -----------------------------------------------------------------------------
create table buses (
  id uuid primary key default gen_random_uuid(),
  bus_number text not null unique,
  route_id uuid references routes (id) on delete set null,
  capacity int not null check (capacity > 0),
  type bus_type not null default 'NON_AC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger buses_set_updated_at
  before update on buses
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- conductors: operational profile, 1:1 with an auth.users identity created
-- by the admin-only provisioning RPC (create_conductor_account).
-- -----------------------------------------------------------------------------
create table conductors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  government_id text not null unique,
  display_name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conductors_set_updated_at
  before update on conductors
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- transport_authority_config: single-row config table read by
-- create_secure_ticket() to authoritatively validate the collecting UPI id
-- server-side, independent of whatever the client displays.
-- -----------------------------------------------------------------------------
create table transport_authority_config (
  id boolean primary key default true constraint single_row check (id),
  upi_id text not null,
  is_payments_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger transport_authority_config_set_updated_at
  before update on transport_authority_config
  for each row execute function set_updated_at();
