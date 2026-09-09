import type {
  AlertSeverity,
  AlertSourceRole,
  AlertStatus,
  AccountStatus,
  BusType,
  ComplaintStatus,
  ComplaintType,
  EtmStatus,
  ScheduleStatus,
  TicketChannel,
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
// districts
// -----------------------------------------------------------------------------
export interface District {
  id: string;
  name: string;
  code: string;
  state: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DistrictInsert {
  name: string;
  code: string;
  state?: string;
}

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
  district_id?: string | null;
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
  code?: string | null;
  is_active?: boolean;
  district_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteInsert {
  route_number: string;
  name: string;
  code?: string | null;
  is_active?: boolean;
  district_id?: string | null;
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
  district_id: string | null;
  is_active: boolean;
  is_wheelchair_accessible: boolean;
  registration_number: string | null;
  bus_qr_payload: string | null;
  bus_qr_signature: string | null;
  qr_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusInsert {
  bus_number: string;
  route_id?: string | null;
  capacity: number;
  type: BusType;
  district_id?: string | null;
  is_wheelchair_accessible?: boolean;
  registration_number?: string | null;
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
  district_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConductorInsert {
  government_id: string;
  display_name: string;
  phone?: string | null;
  is_active?: boolean;
  district_id?: string | null;
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
  scheduled_departure?: string | null;
  scheduled_arrival?: string | null;
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
  is_wheelchair_accessible: boolean;
  district_id: string | null;
}

// -----------------------------------------------------------------------------
// trip_seat_segments
// -----------------------------------------------------------------------------
export interface TripSeatSegment {
  trip_id: string;
  from_stop_id: string;
  to_stop_id: string;
  sequence_order: number;
  occupied_seats: number;
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
  channel: TicketChannel;
  pnr: string | null;
  district_id: string | null;
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
  district_id: string | null;
  severity: AlertSeverity;
  title: string | null;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  status: AlertStatus;
  source_role: AlertSourceRole;
  passenger_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AlertInsert {
  trip_id?: string | null;
  bus_id?: string | null;
  conductor_id?: string | null;
  district_id?: string | null;
  severity: AlertSeverity;
  title?: string;
  message?: string;
  latitude?: number | null;
  longitude?: number | null;
  source_role?: AlertSourceRole;
  passenger_id?: string | null;
}

// -----------------------------------------------------------------------------
// alert_messages (SOS thread)
// -----------------------------------------------------------------------------
export interface AlertMessage {
  id: string;
  alert_id: string;
  sender_id: string;
  sender_role: "admin" | "master_admin" | "conductor";
  message: string;
  created_at: string;
}

export interface AlertMessageInsert {
  alert_id: string;
  sender_id: string;
  sender_role: "admin" | "master_admin" | "conductor";
  message: string;
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
  full_name: string | null;
  phone: string | null;
  district_id: string | null;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// complaints
// -----------------------------------------------------------------------------
export interface Complaint {
  id: string;
  trip_id: string | null;
  bus_id: string | null;
  district_id: string | null;
  passenger_id: string | null;
  type: ComplaintType;
  description: string | null;
  status: ComplaintStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplaintInsert {
  trip_id?: string | null;
  type: ComplaintType;
  description?: string | null;
}

// -----------------------------------------------------------------------------
// etm_devices
// -----------------------------------------------------------------------------
export interface EtmDevice {
  id: string;
  device_serial: string;
  assigned_bus_id: string | null;
  assigned_conductor_id: string | null;
  district_id: string | null;
  status: EtmStatus;
  battery_level: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EtmDeviceInsert {
  device_serial: string;
  assigned_bus_id?: string | null;
  assigned_conductor_id?: string | null;
  district_id?: string | null;
  status?: EtmStatus;
  battery_level?: number | null;
}

// -----------------------------------------------------------------------------
// razorpay_orders
// -----------------------------------------------------------------------------
export interface RazorpayOrder {
  id: string;               // Razorpay order_id
  passenger_id: string | null;
  trip_id: string | null;
  origin_stop_id: string | null;
  dest_stop_id: string | null;
  passenger_count: number;
  amount_paise: number;
  currency: string;
  status: "CREATED" | "PAID" | "FAILED" | "REFUNDED" | "EXPIRED";
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  ticket_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Revenue analytics
// -----------------------------------------------------------------------------
export interface RevenueMonthData {
  month: string;     // e.g. "Sep 2026"
  revenue: number;
  tickets: number;
}

export interface RevenueRouteData {
  route: string;
  number: string;
  revenue: number;
}

export interface RevenueSummary {
  total_revenue: number;
  total_tickets: number;
  monthly_data: RevenueMonthData[];
  route_revenue: RevenueRouteData[];
}

// -----------------------------------------------------------------------------
// Bus QR generation result
// -----------------------------------------------------------------------------
export interface BusQrResult {
  bus_id: string;
  qr_payload: string;
  qr_signature: string;
  qr_string: string;   // payload.signature — scan this on conductor ETM
  generated_at: string;
}
