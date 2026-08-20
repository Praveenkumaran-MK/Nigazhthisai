import { Navigate, Route, Routes } from "react-router-dom";
import { LoadingState, ErrorState } from "@sbt/ui";
import { useAdminAuth } from "./hooks/useAdminAuth";
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAdminAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingState label="Checking session…" />
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
  // Frontend gate is UX-only — every request below is still enforced by
  // Postgres RLS (is_admin(), migration 007), which is the real boundary.
  return <AppShell>{children}</AppShell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/stops" element={<ProtectedRoute><StopsPage /></ProtectedRoute>} />
      <Route path="/routes" element={<ProtectedRoute><RoutesPage /></ProtectedRoute>} />
      <Route path="/route-stops" element={<ProtectedRoute><RouteStopsPage /></ProtectedRoute>} />
      <Route path="/fares" element={<ProtectedRoute><FaresPage /></ProtectedRoute>} />
      <Route path="/buses" element={<ProtectedRoute><BusesPage /></ProtectedRoute>} />
      <Route path="/conductors" element={<ProtectedRoute><ConductorsPage /></ProtectedRoute>} />
      <Route path="/trips" element={<ProtectedRoute><TripsPage /></ProtectedRoute>} />
      <Route path="/schedules" element={<ProtectedRoute><SchedulesPage /></ProtectedRoute>} />
      <Route path="/import" element={<ProtectedRoute><CsvImportPage /></ProtectedRoute>} />
      <Route path="/fleet" element={<ProtectedRoute><FleetPage /></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute><AlertsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
