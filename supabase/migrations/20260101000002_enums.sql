-- =============================================================================
-- 002: Enum types
-- =============================================================================
create type user_role as enum ('passenger', 'conductor', 'admin');

create type bus_type as enum ('AC', 'NON_AC');

create type trip_status as enum ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

create type trip_stop_status as enum ('UPCOMING', 'ARRIVED', 'DEPARTED', 'SKIPPED');

create type ticket_status as enum ('CREATED', 'PAID', 'VALIDATED', 'EXPIRED', 'CANCELLED');

create type alert_severity as enum ('INFO', 'WARNING', 'CRITICAL', 'SOS');

create type alert_status as enum ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');

create type schedule_status as enum ('PLANNED', 'CONFIRMED', 'CANCELLED');
