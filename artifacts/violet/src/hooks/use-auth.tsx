import React, { createContext, useContext, useState, useEffect } from 'react';
import type { UserProfile, Tenant } from "@workspace/api-client-react";

type StoredAuthState = {
  user: UserProfile | null;
  tenant: Tenant | null;
  token: string | null;
};

interface AuthState {
  user: UserProfile | null;
  tenant: Tenant | null;
  token: string | null;
  managerAccess: { accessToken: string; expiresAt: string } | null;
  isManagerAccessActive: boolean;
  setAuth: (user: UserProfile, tenant: Tenant, token: string) => void;
  updateUser: (user: UserProfile) => void;
  updateTenant: (tenant: Tenant) => void;
  setManagerAccess: (accessToken: string, expiresAt: string) => void;
  clearManagerAccess: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const authStorageKey = "violet_auth";
const managerAccessStorageKey = "violet_manager_access";
const emptyAuthState: StoredAuthState = { user: null, tenant: null, token: null };

function parseAuthState(value: string | null): StoredAuthState | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredAuthState>;
    if (
      typeof parsed.token !== "string" ||
      !parsed.token ||
      !parsed.user ||
      typeof parsed.user !== "object" ||
      !parsed.tenant ||
      typeof parsed.tenant !== "object"
    ) {
      return null;
    }

    return {
      user: parsed.user as UserProfile,
      tenant: parsed.tenant as Tenant,
      token: parsed.token,
    };
  } catch {
    return null;
  }
}

function readManagerAccess(): { accessToken: string; expiresAt: string } | null {
  try {
    const stored = sessionStorage.getItem(managerAccessStorageKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { accessToken?: string; expiresAt?: string };
    if (!parsed.accessToken || !parsed.expiresAt || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(managerAccessStorageKey);
      return null;
    }
    return { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt };
  } catch {
    sessionStorage.removeItem(managerAccessStorageKey);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoredAuthState>(() => (
    parseAuthState(localStorage.getItem(authStorageKey)) ?? emptyAuthState
  ));
  const [managerAccess, setManagerAccessState] = useState(readManagerAccess);

  useEffect(() => {
    if (state.token) {
      localStorage.setItem(authStorageKey, JSON.stringify(state));
    } else {
      localStorage.removeItem(authStorageKey);
    }
  }, [state]);

  const setAuth = (user: UserProfile, tenant: Tenant, token: string) => {
    const next = { user, tenant, token };
    // Write synchronously before the navigation redirect fires so that the
    // next page's initializer finds a populated localStorage immediately.
    localStorage.setItem(authStorageKey, JSON.stringify(next));
    sessionStorage.removeItem(managerAccessStorageKey);
    setManagerAccessState(null);
    setState(next);
  };

  const updateUser = (user: UserProfile) => {
    setState((prev) => {
      const next = { ...prev, user };
      localStorage.setItem(authStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const updateTenant = (tenant: Tenant) => {
    setState((prev) => {
      const next = { ...prev, tenant };
      localStorage.setItem(authStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const setManagerAccess = (accessToken: string, expiresAt: string) => {
    const next = { accessToken, expiresAt };
    sessionStorage.setItem(managerAccessStorageKey, JSON.stringify(next));
    setManagerAccessState(next);
  };

  const clearManagerAccess = () => {
    sessionStorage.removeItem(managerAccessStorageKey);
    setManagerAccessState(null);
  };

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== authStorageKey && event.key !== null) return;

      if (event.newValue === null) {
        setState(emptyAuthState);
        sessionStorage.removeItem(managerAccessStorageKey);
        setManagerAccessState(null);
        return;
      }

      const next = parseAuthState(event.newValue);
      if (!next) {
        setState(emptyAuthState);
        sessionStorage.removeItem(managerAccessStorageKey);
        setManagerAccessState(null);
        return;
      }

      // Manager elevation is tied to the current session token and tenant.
      // Keep it for profile/tenant updates in the same session, but never
      // carry it into another account or tenant opened in a different tab.
      const sessionChanged =
        state.token !== next.token ||
        state.user?.id !== next.user?.id ||
        state.tenant?.id !== next.tenant?.id;
      if (sessionChanged) {
        sessionStorage.removeItem(managerAccessStorageKey);
        setManagerAccessState(null);
      }

      setState(next);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [state.token, state.user?.id, state.tenant?.id]);

  useEffect(() => {
    if (!managerAccess) return;

    const delay = new Date(managerAccess.expiresAt).getTime() - Date.now();
    if (delay <= 0) {
      clearManagerAccess();
      return;
    }

    const timeout = window.setTimeout(clearManagerAccess, delay);
    return () => window.clearTimeout(timeout);
  }, [managerAccess]);

  const logout = () => {
    setState(emptyAuthState);
    localStorage.removeItem(authStorageKey);
    clearManagerAccess();
  };

  const isManagerAccessActive = Boolean(
    managerAccess && new Date(managerAccess.expiresAt).getTime() > Date.now(),
  );

  return (
    <AuthContext.Provider value={{
      ...state,
      managerAccess: isManagerAccessActive ? managerAccess : null,
      isManagerAccessActive,
      setAuth,
      updateUser,
      updateTenant,
      setManagerAccess,
      clearManagerAccess,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
