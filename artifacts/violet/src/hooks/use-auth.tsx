import React, { createContext, useContext, useState, useEffect } from 'react';
import type { UserProfile, Tenant } from "@workspace/api-client-react";

interface AuthState {
  user: UserProfile | null;
  tenant: Tenant | null;
  token: string | null;
  setAuth: (user: UserProfile, tenant: Tenant, token: string) => void;
  updateUser: (user: UserProfile) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

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

  useEffect(() => {
    localStorage.setItem('violet_auth', JSON.stringify(state));
  }, [state]);

  const setAuth = (user: UserProfile, tenant: Tenant, token: string) => {
    const next = { user, tenant, token };
    // Write synchronously before the navigation redirect fires so that the
    // next page's initializer finds a populated localStorage immediately.
    localStorage.setItem('violet_auth', JSON.stringify(next));
    setState(next);
  };

  const updateUser = (user: UserProfile) => {
    setState((prev) => {
      const next = { ...prev, user };
      localStorage.setItem('violet_auth', JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    setState({ user: null, tenant: null, token: null });
    localStorage.removeItem('violet_auth');
  };

  return (
    <AuthContext.Provider value={{ ...state, setAuth, updateUser, logout }}>
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
