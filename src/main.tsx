import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppearanceProvider } from "./context/AppearanceContext";
import { UpdaterProvider } from "./context/UpdaterContext";
import { applyAppearance, loadAppearance } from "./settings/appearance";
import "./styles.css";

applyAppearance(loadAppearance());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppearanceProvider>
      <UpdaterProvider>
        <App />
      </UpdaterProvider>
    </AppearanceProvider>
  </React.StrictMode>,
);
