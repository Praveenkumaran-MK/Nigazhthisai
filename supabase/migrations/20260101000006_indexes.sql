-- =============================================================================
-- 006: Indexes
-- =============================================================================

-- Spatial index for nearest-stop PostGIS queries.
create index stops_location_gix on stops using gist (location);
create index stops_district_idx on stops (district);

create index routes_route_number_idx on routes (route_number);

create index route_stops_route_id_idx on route_stops (route_id);
create index route_stops_stop_id_idx on route_stops (stop_id);

create index fare_matrix_route_id_idx on fare_matrix (route_id);
create index fare_matrix_lookup_idx on fare_matrix (route_id, origin_stop_id, dest_stop_id);

create index buses_route_id_idx on buses (route_id);
create index buses_bus_number_idx on buses (bus_number);

create index conductors_government_id_idx on conductors (government_id);
create index conductors_user_id_idx on conductors (user_id);

create index trips_route_id_idx on trips (route_id);
create index trips_bus_id_idx on trips (bus_id);
create index trips_conductor_id_idx on trips (conductor_id);
create index trips_status_idx on trips (status);
create index trips_service_date_idx on trips (service_date);

create index trip_stops_trip_id_idx on trip_stops (trip_id);
create index trip_stops_status_idx on trip_stops (status);

create index tickets_trip_id_idx on tickets (trip_id);
create index tickets_status_idx on tickets (status);
create index tickets_passenger_session_idx on tickets (passenger_session_id);
create index tickets_bus_id_idx on tickets (bus_id);

create index alerts_status_idx on alerts (status);
create index alerts_created_at_idx on alerts (created_at desc);
create index alerts_severity_idx on alerts (severity);

create index schedules_route_id_idx on schedules (route_id);
create index schedules_bus_id_idx on schedules (bus_id);
create index schedules_scheduled_start_idx on schedules (scheduled_start);
