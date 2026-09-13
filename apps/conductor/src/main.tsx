import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "@sbt/ui";
import "./index.css";
import { App } from "./App";
import { ConductorAuthProvider } from "./hooks/useConductorAuth";
import { ConductorI18nProvider } from "./lib/i18n";

// The conductor app is dark-first (OLED battery efficiency during long
// shifts, and Pocket Mode requires pure black) — always applied, no toggle.
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ConductorI18nProvider>
        <ToastProvider>
          <ConductorAuthProvider>
            <App />
          </ConductorAuthProvider>
        </ToastProvider>
      </ConductorI18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
