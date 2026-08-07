import React, { useEffect, useState } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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

// Setup Dark Mode initially
if (!document.documentElement.classList.contains("dark")) {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(<App />);