export type UserRole = "passenger" | "conductor" | "admin" | "master_admin" | "driver" | "inspector";

/** Roles that have administrative access to the admin PWA */
export type AdminRole = "admin" | "master_admin";

/** Roles that can be provisioned by the admin/master_admin */
export type ProvisionableRole = "conductor" | "driver" | "inspector" | "district_admin";

export type BusType = "AC" | "NON_AC";

export type TripStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type TripStopStatus = "UPCOMING" | "ARRIVED" | "DEPARTED" | "SKIPPED";

export type TicketStatus = "CREATED" | "PAID" | "VALIDATED" | "EXPIRED" | "CANCELLED";

export type TicketChannel = "APP" | "CASH";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL" | "SOS";

export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";

export type ScheduleStatus = "PLANNED" | "CONFIRMED" | "CANCELLED";

export type AccountStatus = "ACTIVE" | "SUSPENDED" | "INACTIVE";

export type ComplaintType =
  | "CLEANLINESS"
  | "DRIVER_BEHAVIOR"
  | "OVERCROWDING"
  | "SAFETY"
  | "OVERCHARGING"
  | "OTHER";

export type ComplaintStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";

export type EtmStatus = "ACTIVE" | "OFFLINE" | "CHARGING" | "FAULTY";

export type AlertSourceRole = "conductor" | "passenger";
