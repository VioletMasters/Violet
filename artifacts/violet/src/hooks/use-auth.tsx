import React, { createContext, useContext, useState, useEffect } from 'react';
import type { UserProfile, Tenant } from "@workspace/api-client-react";

interface AuthState {
  user: UserProfile | null;
  tenant: Tenant | null;
  token: string | null;
  managerAccess: { accessToken: string; expiresAt: string } | null;
  isManagerAccessActive: boolean;
  setAuth: (user: UserProfile, tenant: Tenant, token: string) => void;
  updateUser: (user: UserProfile) => void;
  setManagerAccess: (accessToken: string, expiresAt: string) => void;
  clearManagerAccess: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const managerAccessStorageKey = "violet_manager_access";

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
  const [state, setState] = useState<{ user: UserProfile | null; tenant: Tenant | null; token: string | null }>(() => {
    try {
      const stored = localStorage.getItem('violet_auth');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to parse auth from local storage");
    }
    return { user: null, tenant: null, token: null };
  });
  const [managerAccess, setManagerAccessState] = useState(readManagerAccess);

  useEffect(() => {
    localStorage.setItem('violet_auth', JSON.stringify(state));
  }, [state]);

  const setAuth = (user: UserProfile, tenant: Tenant, token: string) => {
    const next = { user, tenant, token };
    // Write synchronously before the navigation redirect fires so that the
    // next page's initializer finds a populated localStorage immediately.
    localStorage.setItem('violet_auth', JSON.stringify(next));
    sessionStorage.removeItem(managerAccessStorageKey);
    setManagerAccessState(null);
    setState(next);
  };

  const updateUser = (user: UserProfile) => {
    setState((prev) => {
      const next = { ...prev, user };
      localStorage.setItem('violet_auth', JSON.stringify(next));
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
    setState({ user: null, tenant: null, token: null });
    localStorage.removeItem('violet_auth');
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
