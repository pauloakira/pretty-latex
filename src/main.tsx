import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import App from "./App";
import { CrashScreen } from "./presentation/shell/CrashScreen";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CrashScreen>
      <App />
    </CrashScreen>
  </React.StrictMode>,
);
