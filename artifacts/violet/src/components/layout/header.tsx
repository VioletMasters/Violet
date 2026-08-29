import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Moon, Sun, User } from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export function Header() {
  const { user, tenant, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [, setLocation] = useLocation();
  
  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        logout();
        setLocation("/login");
        toast.success("Logged out successfully");
      },
      onError: () => {
        // Fallback locally
        logout();
        setLocation("/login");
      }
    }
  });

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b bg-background z-10 sticky top-0">
      <div className="flex items-center gap-4">
        {/* Mobile menu trigger could go here */}
        <div className="font-medium text-sm text-muted-foreground hidden md:block">
          {tenant?.name}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              aria-label={`Appearance: ${theme}`}
              title="Change appearance"
            >
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span className="hidden md:inline capitalize">{theme}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(value) => {
              if (value === "light" || value === "dark") setTheme(value);
            }}>
              <DropdownMenuRadioItem value="light">
                <Sun className="h-4 w-4" /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="h-4 w-4" /> Dark
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2 text-sm">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground border">
            <User className="w-4 h-4" />
          </div>
          <div className="hidden sm:block">
            <div className="font-medium leading-none">{user?.firstName} {user?.lastName}</div>
            <div className="text-xs text-muted-foreground mt-1 capitalize">{user?.role.replace('_', ' ')}</div>
          </div>
        </div>
        
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => logoutMutation.mutate()}
          className="text-muted-foreground hover:text-foreground"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}