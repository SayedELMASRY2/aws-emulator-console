import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@cloudscape-design/global-styles/index.css";
import { applyMode, Mode } from "@cloudscape-design/global-styles";
import App from "./App";

// Follow the OS light/dark setting.
const mq = window.matchMedia("(prefers-color-scheme: dark)");
const setMode = () => applyMode(mq.matches ? Mode.Dark : Mode.Light);
setMode();
mq.addEventListener("change", setMode);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
