import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { usePassengerSession } from "./hooks/usePassengerSession";
import { LoadingState, ErrorState, OfflineBanner, BottomNav } from "@sbt/ui";
import { HomePage } from "./pages/HomePage";
import { SearchResultsPage } from "./pages/SearchResultsPage";
import { LiveMapPage } from "./pages/LiveMapPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { TicketPage } from "./pages/TicketPage";
import { MyTicketsPage } from "./pages/MyTicketsPage";

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

// The bottom tab bar only appears on these top-level screens — Search/
// Checkout/Ticket/LiveMap are task flows the passenger is meant to
// complete and leave, not destinations to jump between, matching the
// reference app's pattern of a tab bar for top-level sections only.
const TAB_ROUTES = ["/", "/my-tickets"];

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
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
        </Routes>
      </div>
      {showTabBar && (
        <BottomNav
          items={[
            { key: "home", label: "Home", icon: <HomeIcon />, active: location.pathname === "/", onClick: () => navigate("/") },
            {
              key: "tickets",
              label: "My Tickets",
              icon: <TicketIcon />,
              active: location.pathname === "/my-tickets",
              onClick: () => navigate("/my-tickets"),
            },
          ]}
        />
      )}
    </>
  );
}

export function App() {
  const { isReady, error } = usePassengerSession();

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <ErrorState title="Could not connect" description={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingState label="Setting up your session…" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas-light dark:bg-canvas-dark">
      <OfflineBanner message="You're offline — live tracking and ticket purchase are unavailable until you reconnect." />
      <AppRoutes />
    </div>
  );
}
