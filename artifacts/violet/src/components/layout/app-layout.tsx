import React, { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { token, tenant, user, logout, isManagerAccessActive } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  
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
    } else if (tenant?.requiresBillingAction && !isSuperAdmin && location !== "/subscription") {
      setLocation("/subscription");
    }
  }, [token, tenant?.requiresBillingAction, isSuperAdmin, location, setLocation]);

  useEffect(() => {
    if (error) {
      // Only treat a genuine 401 Unauthorized as a sign that the session is
      // gone. Network failures, 5xx errors, and other transient problems should
      // NOT clear the session — the user would lose their work for no reason.
      const status = (error as { status?: number }).status;
      if (status === 401) {
        logout();
        setLocation("/login");
      }
    }
  }, [error, logout, setLocation]);

  const isManagementRoute = [
    "/dashboard",
    "/products",
    "/inventory",
    "/customers",
    "/employees",
    "/suppliers",
    "/reports",
  ].some((route) => location === route || location.startsWith(`${route}/`));

  useEffect(() => {
    if (token && isManagementRoute && !isManagerAccessActive) {
      setLocation("/settings");
    }
  }, [isManagementRoute, isManagerAccessActive, setLocation, token]);

  if (!token) return null;
  if (isManagementRoute && !isManagerAccessActive) return null;

  const isPosRoute = location === "/pos" || location.startsWith("/pos/");
  const showBackButton = !isPosRoute && !(location === "/subscription" && tenant?.requiresBillingAction);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {showBackButton && (
            <div className="mb-5">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
                onClick={() => setLocation(location === "/settings" ? "/pos" : "/settings")}
              >
                <ArrowLeft className="h-4 w-4" />
                {location === "/settings" ? "Back to Point of Sale" : "Back to Settings"}
              </Button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
