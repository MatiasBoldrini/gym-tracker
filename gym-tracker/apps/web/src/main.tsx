import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { logBaselineMetrics } from "./lib/perf";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

if (import.meta.env.DEV || import.meta.env.VITE_PERF_LOG === "true") {
  window.addEventListener("load", () => {
    logBaselineMetrics();
  });
}
