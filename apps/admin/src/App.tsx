import { Navigate, Route, Routes, Link } from "react-router-dom";
import { LoadingState, ErrorState } from "@sbt/ui";
import { useAdminAuth } from "./hooks/useAdminAuth";
import { useFeatureFlags } from "./hooks/useFeatureFlags";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StopsPage } from "./pages/StopsPage";
import { RoutesPage } from "./pages/RoutesPage";
import { RouteStopsPage } from "./pages/RouteStopsPage";
import { FaresPage } from "./pages/FaresPage";
import { BusesPage } from "./pages/BusesPage";
import { ConductorsPage } from "./pages/ConductorsPage";
import { TripsPage } from "./pages/TripsPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { CsvImportPage } from "./pages/CsvImportPage";
import { FleetPage } from "./pages/FleetPage";
import { AlertsPage } from "./pages/AlertsPage";
import { RevenuePage } from "./pages/RevenuePage";
import { EtmPage } from "./pages/EtmPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { BusQrPage } from "./pages/BusQrPage";
import { ComplaintsPage } from "./pages/ComplaintsPage";
import { DistrictsPage } from "./pages/DistrictsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { SystemSettingsPage } from "./pages/SystemSettingsPage";

function ProtectedRoute({
  featureKey,
  children,
}: {
  featureKey?: string;
  children: React.ReactNode;
}) {
  const { status, profile } = useAdminAuth();
  const { isAccessible, loading } = useFeatureFlags();

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingState label="Checking session & permissions…" />
      </div>
    );
  }
  if (status === "signed-out") return <Navigate to="/login" replace />;
  if (status === "forbidden") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <ErrorState title="Not authorized" description="This account does not have admin access." />
      </div>
    );
  }

  const isMasterAdmin = profile?.role === "master_admin";

  // Check feature accessibility for normal admins
  if (!isMasterAdmin && featureKey && !isAccessible(featureKey)) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 mb-4 border border-amber-500/20">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
            Module Access Restricted
          </h2>
          <p className="max-w-md text-xs text-slate-500 dark:text-slate-400 mb-6">
            Access to this module has been temporarily disabled by the Master Authority.
          </p>
          <Link
            to="/dashboard"
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-brand-500 text-navy-900 hover:bg-brand-400 transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute featureKey="dashboard"><DashboardPage /></ProtectedRoute>} />
      <Route path="/stops" element={<ProtectedRoute featureKey="operations_module"><StopsPage /></ProtectedRoute>} />
      <Route path="/routes" element={<ProtectedRoute featureKey="routes_management"><RoutesPage /></ProtectedRoute>} />
      <Route path="/route-stops" element={<ProtectedRoute featureKey="routes_management"><RouteStopsPage /></ProtectedRoute>} />
      <Route path="/fares" element={<ProtectedRoute featureKey="operations_module"><FaresPage /></ProtectedRoute>} />
      <Route path="/buses" element={<ProtectedRoute featureKey="buses_management"><BusesPage /></ProtectedRoute>} />
      <Route path="/conductors" element={<ProtectedRoute featureKey="operations_module"><ConductorsPage /></ProtectedRoute>} />
      <Route path="/trips" element={<ProtectedRoute featureKey="trips_management"><TripsPage /></ProtectedRoute>} />
      <Route path="/schedules" element={<ProtectedRoute featureKey="trips_management"><SchedulesPage /></ProtectedRoute>} />
      <Route path="/import" element={<ProtectedRoute><CsvImportPage /></ProtectedRoute>} />
      <Route path="/fleet" element={<ProtectedRoute featureKey="live_monitoring"><FleetPage /></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute featureKey="operational_alerts"><AlertsPage /></ProtectedRoute>} />
      <Route path="/revenue" element={<ProtectedRoute featureKey="revenue_analytics"><RevenuePage /></ProtectedRoute>} />
      <Route path="/etm" element={<ProtectedRoute featureKey="shops_management"><EtmPage /></ProtectedRoute>} />
      <Route path="/maintenance" element={<ProtectedRoute featureKey="shops_management"><MaintenancePage /></ProtectedRoute>} />
      <Route path="/bus-qr" element={<ProtectedRoute featureKey="shops_management"><BusQrPage /></ProtectedRoute>} />
      <Route path="/complaints" element={<ProtectedRoute featureKey="support_faq"><ComplaintsPage /></ProtectedRoute>} />
      {/* Master Admin-only routes — DB RLS (is_master_admin()) is the authoritative guard */}
      <Route path="/districts" element={<ProtectedRoute><DistrictsPage /></ProtectedRoute>} />
      <Route path="/admin-users" element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>} />
      <Route path="/system-settings" element={<ProtectedRoute><SystemSettingsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
