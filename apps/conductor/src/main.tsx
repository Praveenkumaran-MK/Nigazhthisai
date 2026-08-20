import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "@sbt/ui";
import "./index.css";
import { App } from "./App";
import { ConductorAuthProvider } from "./hooks/useConductorAuth";

// The conductor app is dark-first (OLED battery efficiency during long
// shifts, and Pocket Mode requires pure black) — always applied, no toggle.
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConductorAuthProvider>
          <App />
        </ConductorAuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
