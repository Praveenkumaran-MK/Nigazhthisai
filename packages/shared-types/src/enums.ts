export type UserRole = "passenger" | "conductor" | "admin";

export type BusType = "AC" | "NON_AC";

export type TripStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type TripStopStatus = "UPCOMING" | "ARRIVED" | "DEPARTED" | "SKIPPED";

export type TicketStatus = "CREATED" | "PAID" | "VALIDATED" | "EXPIRED" | "CANCELLED";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL" | "SOS";

export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";

export type ScheduleStatus = "PLANNED" | "CONFIRMED" | "CANCELLED";
