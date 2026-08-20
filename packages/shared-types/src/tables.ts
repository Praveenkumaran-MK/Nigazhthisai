import type {
  AlertSeverity,
  AlertStatus,
  BusType,
  ScheduleStatus,
  TicketStatus,
  TripStatus,
  TripStopStatus,
  UserRole,
} from "./enums";

export interface GpsCoordinate {
  latitude: number;
  longitude: number;
}

// -----------------------------------------------------------------------------
// stops
// -----------------------------------------------------------------------------
export interface Stop {
  id: string;
  name: string;
  code: string;
  district: string;
  /** Decoded from PostGIS geography(point,4326) as { latitude, longitude }. */
  location: GpsCoordinate;
  created_at: string;
  updated_at: string;
}

export interface StopInsert {
  name: string;
  code: string;
  district: string;
  location: GpsCoordinate;
}

export type StopUpdate = Partial<StopInsert>;

export interface NearestStopResult {
  stop_id: string;
  name: string;
  code: string;
  district: string;
  distance_meters: number;
}

// -----------------------------------------------------------------------------
// routes / route_stops
// -----------------------------------------------------------------------------
export interface Route {
  id: string;
  route_number: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface RouteInsert {
  route_number: string;
  name: string;
}

export type RouteUpdate = Partial<RouteInsert>;

export interface RouteStop {
  id: string;
  route_id: string;
  stop_id: string;
  sequence_order: number;
}

export interface RouteStopInsert {
  route_id: string;
  stop_id: string;
  sequence_order: number;
}

/** A route with its stops resolved and ordered by sequence_order ascending. */
export interface RouteWithStops extends Route {
  stops: Array<Stop & { sequence_order: number }>;
}

// -----------------------------------------------------------------------------
// fare_matrix
// -----------------------------------------------------------------------------
export interface FareMatrixEntry {
  id: string;
  route_id: string;
  origin_stop_id: string;
  dest_stop_id: string;
  flat_fare_amount: number;
  created_at: string;
  updated_at: string;
}

export interface FareMatrixInsert {
  route_id: string;
  origin_stop_id: string;
  dest_stop_id: string;
  flat_fare_amount: number;
}

export type FareMatrixUpdate = Partial<FareMatrixInsert>;

// -----------------------------------------------------------------------------
// buses
// -----------------------------------------------------------------------------
export interface Bus {
  id: string;
  bus_number: string;
  route_id: string | null;
  capacity: number;
  type: BusType;
  created_at: string;
  updated_at: string;
}

export interface BusInsert {
  bus_number: string;
  route_id?: string | null;
  capacity: number;
  type: BusType;
}

export type BusUpdate = Partial<BusInsert>;

// -----------------------------------------------------------------------------
// conductors
// -----------------------------------------------------------------------------
export interface Conductor {
  id: string;
  user_id: string | null;
  government_id: string;
  display_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConductorInsert {
  government_id: string;
  display_name: string;
  phone?: string | null;
  is_active?: boolean;
}

export type ConductorUpdate = Partial<ConductorInsert>;

// -----------------------------------------------------------------------------
// trips / trip_stops / trip_occupancy
// -----------------------------------------------------------------------------
export interface Trip {
  id: string;
  bus_id: string;
  route_id: string;
  conductor_id: string | null;
  service_date: string;
  started_at: string | null;
  ended_at: string | null;
  status: TripStatus;
  current_stop_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripInsert {
  bus_id: string;
  route_id: string;
  conductor_id?: string | null;
  service_date?: string;
}

export type TripUpdate = Partial<Pick<Trip, "status" | "current_stop_id" | "conductor_id">>;

export interface TripStop {
  id: string;
  trip_id: string;
  stop_id: string;
  sequence_order: number;
  arrival_time: string | null;
  departure_time: string | null;
  status: TripStopStatus;
}

export interface TripOccupancy {
  trip_id: string;
  current_passenger_count: number;
  capacity: number;
  updated_at: string;
}

export interface EligibleBus {
  trip_id: string;
  bus_id: string;
  bus_number: string;
  bus_type: BusType;
  capacity: number;
  current_stop_id: string | null;
  current_stop_name: string | null;
  available_seats: number;
}

// -----------------------------------------------------------------------------
// tickets
// -----------------------------------------------------------------------------
export interface Ticket {
  id: string;
  passenger_session_id: string;
  bus_id: string;
  trip_id: string;
  origin_stop_id: string;
  dest_stop_id: string;
  passenger_count: number;
  total_fare: number;
  qr_payload: string;
  qr_signature: string;
  status: TicketStatus;
  created_at: string;
  validated_at: string | null;
  expires_at: string;
}

/** Input for the create_secure_ticket RPC — no fare/status field on purpose. */
export interface CreateTicketInput {
  trip_id: string;
  origin_stop_id: string;
  dest_stop_id: string;
  passenger_count: number;
}

export interface ValidateTicketInput {
  /** The raw scanned QR text: `"<qr_payload>.<qr_signature>"`, not the bare payload. */
  qr_payload: string;
  trip_id: string;
}

// -----------------------------------------------------------------------------
// alerts
// -----------------------------------------------------------------------------
export interface Alert {
  id: string;
  trip_id: string | null;
  bus_id: string | null;
  conductor_id: string | null;
  severity: AlertSeverity;
  message: string;
  latitude: number | null;
  longitude: number | null;
  status: AlertStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface AlertInsert {
  trip_id?: string | null;
  bus_id?: string | null;
  conductor_id: string;
  severity: AlertSeverity;
  message: string;
  latitude?: number | null;
  longitude?: number | null;
}

// -----------------------------------------------------------------------------
// schedules
// -----------------------------------------------------------------------------
export interface Schedule {
  id: string;
  route_id: string;
  bus_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: ScheduleStatus;
  created_at: string;
  updated_at: string;
}

export interface ScheduleInsert {
  route_id: string;
  bus_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status?: ScheduleStatus;
}

export type ScheduleUpdate = Partial<ScheduleInsert>;

// -----------------------------------------------------------------------------
// profiles
// -----------------------------------------------------------------------------
export interface Profile {
  id: string;
  role: UserRole;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}
