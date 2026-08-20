import { Navigate, Route, Routes } from "react-router-dom";
import { LoadingState, ErrorState, Button } from "@sbt/ui";
import { useConductorAuth } from "./hooks/useConductorAuth";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TripPage } from "./pages/TripPage";
import { ScannerPage } from "./pages/ScannerPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status, logout } = useConductorAuth();
  if (status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-black">
        <LoadingState label="Checking session…" />
      </div>
    );
  }
  if (status === "signed-out") return <Navigate to="/login" replace />;
  if (status === "unlinked") {
    // A real, authenticated login exists but isn't linked to a conductors
    // row (e.g. an admin's provisioning flow was interrupted after
    // creating the login but before linking it). Without this, the
    // Dashboard's own effect returns early on a null conductor and the
    // screen was a permanent spinner with no indication of what's wrong.
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-black p-6 text-center">
        <ErrorState
          title="Account not linked"
          description="Your login isn't linked to a conductor profile yet. Contact your district admin to finish setting up your account."
        />
        <Button variant="outline" onClick={logout}>
          Sign out
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

export function App() {
  // bg-canvas-oled is true #000000, not the softer canvas-dark used by
  // Passenger/Admin: the Conductor app runs for a full shift on a phone, so
  // OLED black is a battery requirement here (same reason Pocket Mode is
  // pure black), not a stylistic choice.
  return (
    <div className="min-h-dvh bg-canvas-oled text-slate-100">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trip/:tripId"
          element={
            <ProtectedRoute>
              <TripPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trip/:tripId/scanner"
          element={
            <ProtectedRoute>
              <ScannerPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}
