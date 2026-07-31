import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker for PWA install support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Registration succeeded
        console.debug('Service worker registered:', reg);
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  });
}
