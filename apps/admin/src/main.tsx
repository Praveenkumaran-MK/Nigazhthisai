import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "@sbt/ui";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { App } from "./App";
import { AdminAuthProvider } from "./hooks/useAdminAuth";

// The HTML <title> is baked at build time (same bundle for both portals).
// Override it immediately so the browser tab shows the correct tier.
const isMasterAdminHost =
  typeof window !== "undefined" && window.location.hostname.includes("superadmin");
document.title = isMasterAdminHost
  ? "Thanjai Transit — Master Admin"
  : "Thanjai Transit — District Admin";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AdminAuthProvider>
          <App />
        </AdminAuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
