import React, { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { token, logout, setAuth } = useAuth();
  
  // Verify token
  const { data: me, error } = useGetMe({
    query: {
      queryKey: ["me", token],
      enabled: !!token,
      retry: false,
    }
  });

  useEffect(() => {
    if (!token) {
      setLocation("/login");
    }
  }, [token, location, setLocation]);

  useEffect(() => {
    if (error) {
      logout();
      setLocation("/login");
    }
  }, [error, logout, setLocation]);

  if (!token) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
