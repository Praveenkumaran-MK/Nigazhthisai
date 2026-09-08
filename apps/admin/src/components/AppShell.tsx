import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Button, StatusIndicator, BrandLogo, AppHeader } from "@sbt/ui";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

const navGroups = [
  {
    label: "Operations",
    masterOnly: false,
    items: [
      { to: "/dashboard",   label: "Overview",    masterOnly: false },
      { to: "/stops",       label: "Stops",       masterOnly: false },
      { to: "/routes",      label: "Routes",      masterOnly: false },
      { to: "/route-stops", label: "Route Stops", masterOnly: false },
      { to: "/fares",       label: "Fares",       masterOnly: false },
      { to: "/buses",       label: "Buses",       masterOnly: false },
      { to: "/conductors",  label: "Conductors",  masterOnly: false },
      { to: "/trips",       label: "Trips",       masterOnly: false },
      { to: "/schedules",   label: "Schedules",   masterOnly: false },
      { to: "/import",      label: "CSV Import",  masterOnly: true  },
    ],
  },
  {
    label: "Monitoring",
    masterOnly: false,
    items: [
      { to: "/fleet",       label: "Live Fleet",    masterOnly: false },
      { to: "/alerts",      label: "🆘 Alerts",     masterOnly: false },
      { to: "/complaints",  label: "📋 Complaints", masterOnly: false },
    ],
  },
  {
    label: "Finance",
    masterOnly: false,
    items: [
      { to: "/revenue",     label: "Revenue Analytics", masterOnly: false },
    ],
  },
  {
    label: "Maintenance",
    masterOnly: false,
    items: [
      { to: "/etm",         label: "ETM Devices", masterOnly: false },
      { to: "/bus-qr",      label: "Bus QR Codes", masterOnly: false },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, logout } = useAdminAuth();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  const isMasterAdmin = profile?.role === "master_admin";
  const roleLabel = isMasterAdmin ? "Master Admin" : "District Admin";
  const roleBadgeClass = isMasterAdmin
    ? "bg-brand-500 text-navy-900"
    : "bg-white/10 text-white/70";

  // Filter nav items based on role: district admins don't see master-only items
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isMasterAdmin || !item.masterOnly),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-dvh bg-canvas-light dark:bg-canvas-dark">
      <aside className="hidden w-60 shrink-0 bg-navy-depth p-4 md:block lg:w-64">
        {/* Desktop sidebar gets the full lockup; the mobile/tablet header
            below falls back to the mark alone (see AppHeader). */}
        <div className="mb-3 px-2 pt-1">
          <BrandLogo variant="lockup" tone="light" />
        </div>
        {/* Role badge pinned below logo so the user always knows which tier they're in */}
        <div className="mb-5 px-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleBadgeClass}`}>
            {roleLabel}
          </span>
        </div>
        <nav className="flex flex-col gap-4">
          {visibleNavGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `rounded-pill px-4 py-2 text-sm font-medium transition-colors ${
                        isActive ? "bg-brand-500 font-semibold text-navy-900" : "text-white/60 hover:bg-white/10 hover:text-white"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <AppHeader
          variant="plain"
          sticky
          /* The sidebar already carries the brand on md+, so the mark only
             appears here on smaller screens where the sidebar is hidden. */
          leading={
            <span className="flex items-center gap-3">
              <BrandLogo variant="mark" tone="navy" className="h-7 w-7 md:hidden" />
              <StatusIndicator
                status={isOnline ? "online" : "offline"}
                label={isOnline ? "Connected" : "Offline — some actions are disabled"}
              />
            </span>
          }
          actions={
            <>
              <span className="hidden items-center gap-2 sm:inline-flex">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {profile?.display_name}
                </span>
                {/* Role badge in the top bar — visible on medium+ screens alongside the display name */}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleBadgeClass}`}>
                  {roleLabel}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await logout();
                  navigate("/login", { replace: true });
                }}
              >
                Sign out
              </Button>
            </>
          }
        />
        <main className="flex-1 overflow-y-auto p-5">{children}</main>
      </div>
    </div>
  );
}
