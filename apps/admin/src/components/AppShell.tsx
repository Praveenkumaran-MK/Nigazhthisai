import type { ReactNode } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { BrandLogo } from "@sbt/ui";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useAdminI18n } from "../lib/i18n";
import {
  LayoutDashboard,
  Activity,
  AlertTriangle,
  ShieldAlert,
  MapPin,
  Navigation,
  Layers,
  Bus,
  Calendar,
  DollarSign,
  Users,
  Settings,
  Globe,
  UploadCloud,
  FileSpreadsheet,
  LogOut,
  User,
  ArrowLeft,
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  masterOnly?: boolean;
  featureKey?: string;
}

interface NavGroup {
  label: string;
  masterOnly?: boolean;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Operations",
    masterOnly: false,
    items: [
      { to: "/dashboard",   label: "Dashboard",       icon: LayoutDashboard, masterOnly: false, featureKey: "dashboard" },
      { to: "/fleet",       label: "Live Monitoring", icon: Activity,        masterOnly: false, featureKey: "live_monitoring" },
      { to: "/alerts",      label: "Idle & Alerts",   icon: AlertTriangle,   masterOnly: false, featureKey: "operational_alerts" },
      { to: "/stops",       label: "Stops",           icon: MapPin,          masterOnly: false, featureKey: "operations_module" },
      { to: "/routes",      label: "Routes",          icon: Navigation,      masterOnly: false, featureKey: "routes_management" },
      { to: "/route-stops", label: "Route Stops",     icon: Layers,          masterOnly: false, featureKey: "routes_management" },
      { to: "/buses",       label: "Buses Fleet",     icon: Bus,             masterOnly: false, featureKey: "buses_management" },
      { to: "/trips",       label: "Trips & Schedules",icon: Calendar,       masterOnly: false, featureKey: "trips_management" },
      { to: "/schedules",   label: "Schedules Matrix",icon: Calendar,        masterOnly: false, featureKey: "trips_management" },
      { to: "/revenue",     label: "Tickets & Revenue",icon: DollarSign,     masterOnly: false, featureKey: "revenue_analytics" },
      { to: "/fares",       label: "Fares Matrix",    icon: DollarSign,      masterOnly: false, featureKey: "operations_module" },
      { to: "/conductors",  label: "Conductors Directory", icon: Users,      masterOnly: false, featureKey: "operations_module" },
      { to: "/complaints",  label: "Complaints & Grievance", icon: ShieldAlert, masterOnly: false, featureKey: "support_faq" },
      { to: "/maintenance", label: "Fleet Maintenance",icon: Settings,       masterOnly: false, featureKey: "shops_management" },
      { to: "/bus-qr",      label: "Bus QR Codes",    icon: FileSpreadsheet, masterOnly: false, featureKey: "shops_management" },
    ],
  },
  {
    label: "Master Control",
    masterOnly: true,
    items: [
      { to: "/districts",       label: "Districts",       icon: Globe,           masterOnly: true },
      { to: "/admin-users",     label: "Users & Roles",   icon: Users,           masterOnly: true },
      { to: "/system-settings", label: "System Settings", icon: Settings,        masterOnly: true },
      { to: "/import",          label: "CSV Import",      icon: UploadCloud,     masterOnly: true },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, logout } = useAdminAuth();
  const { isAccessible } = useFeatureFlags();
  const { lang, setLang, t } = useAdminI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const isMasterAdmin = profile?.role === "master_admin";
  const roleLabel = isMasterAdmin ? "MASTER ADMIN" : "DISTRICT ADMIN";

  // Filter nav items: master admins see everything; district admins see enabled modules
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (isMasterAdmin) return true;
        if (item.masterOnly) return false;
        return isAccessible(item.featureKey);
      }),
    }))
    .filter((group) => group.items.length > 0);

  // Compute current page title from path
  const currentPath = location.pathname;
  const activeNavItem = navGroups
    .flatMap((g) => g.items)
    .find((i) => i.to === currentPath);
  const pageTitle = activeNavItem ? activeNavItem.label : "Dashboard";

  return (
    <div key={lang} className="flex min-h-dvh bg-[#F8FAFC]">
      {/* ── Left Sidebar (Solid Deep Navy #0D2A5D matching reference) ── */}
      <aside className="hidden w-64 shrink-0 bg-[#0D2A5D] text-white flex-col justify-between md:flex border-r border-[#0D2A5D]">
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Brand Header */}
          <div className="flex items-center gap-2.5 px-6 py-6 border-b border-white/10">
            <BrandLogo variant="mark" tone="light" className="h-8 w-8 shrink-0" />
            <div className="flex items-baseline gap-1.5 leading-none">
              <span className="font-extrabold tracking-wider text-base text-white">{t("NIGAZHTHISAI")}</span>
              <span className="font-extrabold tracking-wider text-base text-[#D97F00]">
                {isMasterAdmin ? t("MASTER") : t("ADMIN")}
              </span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-1 p-4">
            {visibleNavGroups.map((group) => (
              <div key={group.label} className="mb-2">
                {visibleNavGroups.length > 1 && (
                  <p className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-widest text-white/40">
                    {t(group.label)}
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  {group.items.map((item) => {
                    const IconComponent = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `group flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                            isActive
                              ? "bg-white/10 text-white border-l-4 border-[#D97F00] shadow-sm pl-3"
                              : "text-white/70 hover:bg-white/5 hover:text-white"
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <IconComponent
                              className={`h-4 w-4 transition-colors ${
                                isActive ? "text-[#D97F00]" : "text-white/60 group-hover:text-white"
                              }`}
                            />
                            <span>{t(item.label)}</span>
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom Dedicated Logout Button */}
        <div className="p-4 border-t border-white/10">
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate("/login", { replace: true });
            }}
            className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4 text-red-400" />
            <span>{t("LOGOUT")}</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content Area & Top Header ── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Operations Top Bar (Light canvas #F8FAFC with subtle border) */}
        <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-[#F8FAFC]/95 px-6 backdrop-blur">
          {/* Left: Back Action & Section Title */}
          <div className="flex items-center gap-4">
            {location.pathname !== "/dashboard" && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-[#0D2A5D] transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{t("BACK")}</span>
              </button>
            )}
            <h1 className="text-sm font-black uppercase tracking-wider text-[#0D2A5D]">
              {t(pageTitle).toUpperCase()}
            </h1>
          </div>

          {/* Right: Language Pill & User Profile (Notification Icon Removed) */}
          <div className="flex items-center gap-4">
            {/* Bilingual Language Switcher Pill */}
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200/60">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`rounded-md px-3 py-1 text-[11px] font-bold transition-all ${
                  lang === "en"
                    ? "bg-[#0D2A5D] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang("ta")}
                className={`rounded-md px-3 py-1 text-[11px] font-bold transition-all ${
                  lang === "ta"
                    ? "bg-[#0D2A5D] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                TA
              </button>
            </div>

            {/* User Profile Display */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold uppercase tracking-wider text-[#0D2A5D] leading-tight">
                  {profile?.display_name || (isMasterAdmin ? t("MASTER ADMIN") : t("DISTRICT ADMIN"))}
                </p>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#D97F00] leading-tight">
                  {t(roleLabel)}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border-2 border-[#0D2A5D] text-[#0D2A5D] shadow-sm">
                <User className="h-4 w-4" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#F8FAFC]">
          {children}
        </main>
      </div>
    </div>
  );
}
