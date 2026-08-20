-- =============================================================================
-- 004: Operational tables — trips, trip_stops, trip_occupancy, schedules
-- =============================================================================

create table trips (
  id uuid primary key default gen_random_uuid(),
  bus_id uuid not null references buses (id) on delete restrict,
  route_id uuid not null references routes (id) on delete restrict,
  conductor_id uuid references conductors (id) on delete set null,
  service_date date not null default current_date,
  started_at timestamptz,
  ended_at timestamptz,
  status trip_status not null default 'SCHEDULED',
  current_stop_id uuid references stops (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trips_set_updated_at
  before update on trips
  for each row execute function set_updated_at();

create table trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  stop_id uuid not null references stops (id) on delete restrict,
  sequence_order int not null,
  arrival_time timestamptz,
  departure_time timestamptz,
  status trip_stop_status not null default 'UPCOMING',
  unique (trip_id, sequence_order),
  unique (trip_id, stop_id)
);

-- trip_occupancy: one row per trip, updated atomically by
-- validate_ticket()/depart_stop_and_expire_tickets(). Never written
-- directly by client code.
create table trip_occupancy (
  trip_id uuid primary key references trips (id) on delete cascade,
  current_passenger_count int not null default 0 check (current_passenger_count >= 0),
  capacity int not null check (capacity > 0),
  updated_at timestamptz not null default now(),
  check (current_passenger_count <= capacity)
);

create trigger trip_occupancy_set_updated_at
  before update on trip_occupancy
  for each row execute function set_updated_at();

create table schedules (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes (id) on delete cascade,
  bus_id uuid not null references buses (id) on delete cascade,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status schedule_status not null default 'PLANNED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);

create trigger schedules_set_updated_at
  before update on schedules
  for each row execute function set_updated_at();
