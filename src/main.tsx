import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppearanceProvider } from "./context/AppearanceContext";
import { AppToastProvider } from "./context/AppToastContext";
import { UpdaterProvider } from "./context/UpdaterContext";
import { applyAppearance, loadAppearance } from "./settings/appearance";
import "./styles/index.css";

applyAppearance(loadAppearance());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppearanceProvider>
      <UpdaterProvider>
        <AppToastProvider>
          <App />
        </AppToastProvider>
      </UpdaterProvider>
    </AppearanceProvider>
  </React.StrictMode>,
);
