import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Button, StatusIndicator, BrandLogo, AppHeader } from "@sbt/ui";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

const navItems = [
  { to: "/dashboard", label: "Overview" },
  { to: "/stops", label: "Stops" },
  { to: "/routes", label: "Routes" },
  { to: "/route-stops", label: "Route Stops" },
  { to: "/fares", label: "Fares" },
  { to: "/buses", label: "Buses" },
  { to: "/conductors", label: "Conductors" },
  { to: "/trips", label: "Trips" },
  { to: "/schedules", label: "Schedules" },
  { to: "/import", label: "CSV Import" },
  { to: "/fleet", label: "Live Fleet" },
  { to: "/alerts", label: "Alerts" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, logout } = useAdminAuth();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  return (
    <div className="flex min-h-dvh bg-canvas-light dark:bg-canvas-dark">
      <aside className="hidden w-60 shrink-0 bg-navy-depth p-4 md:block lg:w-64">
        {/* Desktop sidebar gets the full lockup; the mobile/tablet header
            below falls back to the mark alone (see AppHeader). */}
        <div className="mb-6 px-2 pt-1">
          <BrandLogo variant="lockup" tone="light" />
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-pill px-4 py-2 text-sm font-medium transition-colors ${
                  // navy-900 on amber = 6.3:1; white would be 2.99:1 and fail.
                  isActive ? "bg-brand-500 font-semibold text-navy-900" : "text-white/60 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
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
              <span className="hidden text-sm text-slate-500 sm:inline dark:text-slate-400">
                {profile?.display_name}
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
