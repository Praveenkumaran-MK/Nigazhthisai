import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "@sbt/ui";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { App } from "./App";
import { AdminAuthProvider } from "./hooks/useAdminAuth";

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
