import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Boxes, 
  Users, 
  UserSquare2, 
  Truck, 
  BarChart3, 
  Settings, 
  CreditCard,
  ShieldAlert
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/pos", label: "Point of Sale", icon: ShoppingCart },
    { href: "/products", label: "Products", icon: Package },
    { href: "/inventory", label: "Inventory", icon: Boxes },
    { href: "/customers", label: "Customers", icon: Users },
    { href: "/employees", label: "Employees", icon: UserSquare2 },
    { href: "/suppliers", label: "Suppliers", icon: Truck },
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/subscription", label: "Subscription", icon: CreditCard },
  ];

  if (user?.role === "super_admin") {
    links.push({ href: "/admin", label: "Admin Portal", icon: ShieldAlert });
  }

  return (
    <div className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border">
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-white" />
          </div>
          <span className="font-display font-bold text-lg text-sidebar-foreground tracking-tight">Violet</span>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {links.map((link) => {
            const isActive = location === link.href || location.startsWith(`${link.href}/`);
            return (
              <Link 
                key={link.href} 
                href={link.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <link.icon className={cn("w-4 h-4", isActive ? "text-primary" : "")} />
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  );
}
