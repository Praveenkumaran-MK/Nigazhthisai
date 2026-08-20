-- =============================================================================
-- 005: tickets, alerts
-- =============================================================================

create table tickets (
  id uuid primary key default gen_random_uuid(),
  -- passenger_session_id: the auth.uid() of a Supabase ANONYMOUS auth
  -- session (supabase.auth.signInAnonymously()), established silently on
  -- first load by the Passenger PWA. No form, password or identity is ever
  -- shown to the passenger ("zero-login" UX), but RLS can still scope
  -- ticket visibility to `auth.uid() = passenger_session_id` because the
  -- anonymous session has a real, server-verified JWT.
  passenger_session_id uuid not null,
  bus_id uuid not null references buses (id) on delete restrict,
  trip_id uuid not null references trips (id) on delete restrict,
  origin_stop_id uuid not null references stops (id) on delete restrict,
  dest_stop_id uuid not null references stops (id) on delete restrict,
  passenger_count int not null default 1 check (passenger_count > 0 and passenger_count <= 6),
  total_fare numeric(10, 2) not null check (total_fare >= 0),
  qr_payload text not null unique,
  qr_signature text not null,
  status ticket_status not null default 'CREATED',
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  expires_at timestamptz not null,
  check (origin_stop_id <> dest_stop_id)
);

-- No updated_at trigger: tickets are append-mostly. Status transitions are
-- tracked via validated_at and enforced exclusively through validate_ticket()
-- / depart_stop_and_expire_tickets(), never a direct client UPDATE.

create table alerts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips (id) on delete set null,
  bus_id uuid references buses (id) on delete set null,
  conductor_id uuid references conductors (id) on delete set null,
  severity alert_severity not null,
  message text not null,
  latitude double precision,
  longitude double precision,
  status alert_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
