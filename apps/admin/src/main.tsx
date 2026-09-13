import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "@sbt/ui";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { App } from "./App";
import { AdminAuthProvider } from "./hooks/useAdminAuth";
import { FeatureFlagsProvider } from "./hooks/useFeatureFlags";
import { AdminI18nProvider } from "./lib/i18n";

// The HTML <title> is baked at build time (same bundle for both portals).
// Override it immediately so the browser tab shows the correct tier.
const isMasterAdminHost =
  typeof window !== "undefined" && window.location.hostname.includes("superadmin");
document.title = isMasterAdminHost
  ? "Nigazhthisai — Master Admin"
  : "Nigazhthisai — District Admin";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AdminI18nProvider>
        <ToastProvider>
          <AdminAuthProvider>
            <FeatureFlagsProvider>
              <App />
            </FeatureFlagsProvider>
          </AdminAuthProvider>
        </ToastProvider>
      </AdminI18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
