import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingCart, 
  Settings, 
  ShieldAlert
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;

    try {
      return window.localStorage.getItem("violet.sidebar.collapsed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("violet.sidebar.collapsed", String(isCollapsed));
    } catch {
      // Sidebar state is still usable when storage is unavailable.
    }
  }, [isCollapsed]);

  const links = [
    { href: "/pos", label: "Point of Sale", icon: ShoppingCart },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  if (user?.role === "super_admin") {
    links.push({ href: "/admin", label: "Admin Portal", icon: ShieldAlert });
  }

  return (
    <aside
      className={cn(
        "hidden md:flex shrink-0 flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-200 ease-in-out",
        isCollapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <div
        className={cn(
          "h-16 flex items-center border-b border-sidebar-border",
          isCollapsed ? "justify-between gap-1 px-1" : "justify-between px-6",
        )}
      >
        <Link
          href="/pos"
          className={cn("flex items-center gap-2", isCollapsed && "justify-center")}
          aria-label="Go to Point of Sale"
        >
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-white" />
          </div>
          {!isCollapsed && (
            <span className="font-display font-bold text-lg text-sidebar-foreground tracking-tight">
              Violet
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors",
            "hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary",
          )}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className={cn("space-y-1", isCollapsed ? "px-2" : "px-3")}>
          {links.map((link) => {
            const isActive = location === link.href || location.startsWith(`${link.href}/`);
            return (
              <Link 
                key={link.href} 
                href={link.href}
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors",
                  isCollapsed
                    ? "justify-center px-2 py-2.5"
                    : "gap-3 px-3 py-2",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
                aria-label={link.label}
                title={isCollapsed ? link.label : undefined}
              >
                <link.icon className={cn("w-4 h-4", isActive ? "text-primary" : "")} />
                {!isCollapsed && link.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  );
}
