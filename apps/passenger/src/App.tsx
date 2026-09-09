import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { usePassengerSession } from "./hooks/usePassengerSession";
import { LoadingState, ErrorState, OfflineBanner, BottomNav } from "@sbt/ui";
import { useI18n } from "./lib/i18n";
import { HomePage } from "./pages/HomePage";
import { SearchResultsPage } from "./pages/SearchResultsPage";
import { LiveMapPage } from "./pages/LiveMapPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { TicketPage } from "./pages/TicketPage";
import { MyTicketsPage } from "./pages/MyTicketsPage";
import { GrievancePage } from "./pages/GrievancePage";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M4 11.5 12 4l8 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path
        d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a1.5 1.5 0 0 0 0 3v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a1.5 1.5 0 0 0 0-3V9Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 7v10" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path
        d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Bottom tab bar only appears on these top-level screens
const TAB_ROUTES = ["/", "/my-tickets", "/report"];

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const showTabBar = TAB_ROUTES.includes(location.pathname);

  return (
    <>
      <div className={showTabBar ? "pb-16" : undefined}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/bus/:tripId" element={<LiveMapPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/ticket/:ticketId" element={<TicketPage />} />
          <Route path="/my-tickets" element={<MyTicketsPage />} />
          <Route path="/report" element={<GrievancePage />} />
        </Routes>
      </div>
      {showTabBar && (
        <BottomNav
          items={[
            {
              key: "home",
              label: t("home"),
              icon: <HomeIcon />,
              active: location.pathname === "/",
              onClick: () => navigate("/"),
            },
            {
              key: "tickets",
              label: t("tickets"),
              icon: <TicketIcon />,
              active: location.pathname === "/my-tickets",
              onClick: () => navigate("/my-tickets"),
            },
            {
              key: "report",
              label: t("grievance"),
              icon: <ReportIcon />,
              active: location.pathname === "/report",
              onClick: () => navigate("/report"),
            },
          ]}
        />
      )}
    </>
  );
}

export function App() {
  const { isReady, error } = usePassengerSession();
  const { t } = useI18n();

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <ErrorState title={t("connecting")} description={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingState label={t("settingUp")} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas-light dark:bg-canvas-dark">
      <OfflineBanner message={t("offline")} />
      <AppRoutes />
    </div>
  );
}
