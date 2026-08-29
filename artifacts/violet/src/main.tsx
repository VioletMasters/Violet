import { setAuthTokenGetter, setManagerAccessTokenGetter } from "@workspace/api-client-react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyTheme, getStoredTheme, ThemeProvider } from "./hooks/use-theme";

// Configure API Client
setAuthTokenGetter(() => {
  try {
    const authStorage = localStorage.getItem("violet_auth");
    if (authStorage) {
      const parsed = JSON.parse(authStorage);
      return parsed.token || null;
    }
  } catch (e) {
    console.error("Failed to parse auth token", e);
  }
  return null;
});

setManagerAccessTokenGetter(() => {
  try {
    const stored = sessionStorage.getItem("violet_manager_access");
    if (!stored) return null;

    const parsed = JSON.parse(stored) as { accessToken?: string; expiresAt?: string };
    if (!parsed.accessToken || !parsed.expiresAt || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem("violet_manager_access");
      return null;
    }

    return parsed.accessToken;
  } catch {
    sessionStorage.removeItem("violet_manager_access");
    return null;
  }
});

// Apply the saved application appearance before the first render.
applyTheme(getStoredTheme());

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);