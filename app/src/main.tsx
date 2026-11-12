import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import EconomyReplay from "./near/EconomyReplay";
const demo = new URLSearchParams(location.search).get("demo") === "economy";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{demo ? <EconomyReplay /> : <App />}</StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch(() => {
      // The game remains playable when offline installation is unavailable.
    });
}
