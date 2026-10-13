import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/outfit/wght.css";
import "@fontsource-variable/playfair-display/wght.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "./styles/base.css";
import "./styles/tiles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
