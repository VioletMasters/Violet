import React, { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { CashierShiftDialog, type CashierShift } from "./cashier-shift-dialog";
import {
  getGetCurrentRegisterShiftQueryKey,
  useGetCurrentRegisterShift,
} from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STARTER_TUTORIAL_ACTION_EVENT, StarterTutorial } from "./starter-tutorial";
import { toast } from "sonner";

const SUPER_ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SUPER_ADMIN_ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll", "wheel"];
const STARTER_TUTORIAL_VERSION = "v1";

type StarterTutorialProgress = {
  step: number;
  completed: boolean;
};

type PendingStarterTutorialNavigation = {
  path: string;
  step: number;
};

function tutorialStorageKey(tenantId: string, userId: string) {
  return `violet.starter-tutorial.${STARTER_TUTORIAL_VERSION}.${tenantId}.${userId}`;
}

function pendingTutorialStorageKey(tutorialKey: string) {
  return `${tutorialKey}.pending`;
}

function readTutorialProgress(key: string): StarterTutorialProgress | null {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<StarterTutorialProgress>;
    return {
      step: Math.min(Math.max(Number(parsed.step) || 0, 0), 2),
      completed: parsed.completed === true,
    };
  } catch {
    return null;
  }
}

function writeTutorialProgress(key: string, progress: StarterTutorialProgress) {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    // The tutorial remains usable when browser storage is unavailable.
  }
}

function readPendingTutorialNavigation(key: string): PendingStarterTutorialNavigation | null {
  try {
    const saved = sessionStorage.getItem(pendingTutorialStorageKey(key));
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<PendingStarterTutorialNavigation>;
    if (typeof parsed.path !== "string" || !parsed.path.startsWith("/") || !Number.isFinite(Number(parsed.step))) {
      return null;
    }
    return {
      path: parsed.path,
      step: Math.min(Math.max(Math.trunc(Number(parsed.step)), 0), 2),
    };
  } catch {
    return null;
  }
}

function writePendingTutorialNavigation(key: string, pending: PendingStarterTutorialNavigation | null) {
  try {
    const storageKey = pendingTutorialStorageKey(key);
    if (pending) {
      sessionStorage.setItem(storageKey, JSON.stringify(pending));
    } else {
      sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Resuming the guide is best effort when session storage is unavailable.
  }
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { token, tenant, user, logout, isManagerAccessActive } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const logoutRef = React.useRef(logout);
  const setLocationRef = React.useRef(setLocation);
  const [settlementDialogOpen, setSettlementDialogOpen] = React.useState(false);
  const [starterTutorialOpen, setStarterTutorialOpen] = React.useState(false);
  const [starterTutorialStep, setStarterTutorialStep] = React.useState(0);
  const [pendingStarterTutorialNavigation, setPendingStarterTutorialNavigation] =
    React.useState<PendingStarterTutorialNavigation | null>(null);
  logoutRef.current = logout;
  setLocationRef.current = setLocation;
  const starterTutorialKey = user && tenant ? tutorialStorageKey(tenant.id, user.id) : null;
  const { data: currentShiftResponse } = useGetCurrentRegisterShift({
    query: {
      queryKey: getGetCurrentRegisterShiftQueryKey(),
      enabled: Boolean(token),
    },
  });
  const currentShift = (currentShiftResponse as { shift?: CashierShift | null } | undefined)?.shift ?? null;

  React.useEffect(() => {
    if (!starterTutorialKey) {
      setPendingStarterTutorialNavigation(null);
      return;
    }
    setPendingStarterTutorialNavigation(readPendingTutorialNavigation(starterTutorialKey));
  }, [starterTutorialKey]);

  React.useEffect(() => {
    if (!starterTutorialKey || user?.mustChangePassword || tenant?.requiresBillingAction || isSuperAdmin) {
      setStarterTutorialOpen(false);
      return;
    }

    const saved = readTutorialProgress(starterTutorialKey);
    if (saved) {
      setStarterTutorialStep(saved.step);
      setStarterTutorialOpen(false);
      return;
    }

    setStarterTutorialStep(0);
    setStarterTutorialOpen(true);
    writeTutorialProgress(starterTutorialKey, { step: 0, completed: false });
  }, [isSuperAdmin, starterTutorialKey, tenant?.requiresBillingAction, user?.mustChangePassword]);

  React.useEffect(() => {
    if (!isManagerAccessActive || !pendingStarterTutorialNavigation || !starterTutorialKey) return;

    const pending = pendingStarterTutorialNavigation;
    const nextStep = Math.min(pending.step + 1, 2);
    writePendingTutorialNavigation(starterTutorialKey, null);
    setPendingStarterTutorialNavigation(null);
    setStarterTutorialStep(nextStep);
    writeTutorialProgress(starterTutorialKey, {
      step: nextStep,
      completed: pending.step === 2,
    });
    setLocation(pending.path);
    setStarterTutorialOpen(false);
  }, [isManagerAccessActive, pendingStarterTutorialNavigation, setLocation, starterTutorialKey]);

  React.useEffect(() => {
    if (!starterTutorialKey) return;

    const handleTutorialAction = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "product-created" && starterTutorialStep <= 1) {
        const nextStep = Math.max(starterTutorialStep, 1);
        setStarterTutorialStep(nextStep);
        writeTutorialProgress(starterTutorialKey, { step: nextStep, completed: false });
        setStarterTutorialOpen(true);
      }

      if (action === "cashier-day-started" && starterTutorialStep >= 1) {
        setStarterTutorialStep(2);
        writeTutorialProgress(starterTutorialKey, { step: 2, completed: false });
        setStarterTutorialOpen(true);
      }
    };

    window.addEventListener(STARTER_TUTORIAL_ACTION_EVENT, handleTutorialAction);
    return () => window.removeEventListener(STARTER_TUTORIAL_ACTION_EVENT, handleTutorialAction);
  }, [starterTutorialKey, starterTutorialStep]);

  const updateStarterTutorialStep = (step: number) => {
    const nextStep = Math.min(Math.max(Math.trunc(step), 0), 2);
    setStarterTutorialStep(nextStep);
    if (starterTutorialKey) {
      writeTutorialProgress(starterTutorialKey, { step: nextStep, completed: false });
    }
  };

  const openStarterTutorial = () => {
    setStarterTutorialOpen(true);
  };

  const completeStarterTutorial = () => {
    if (starterTutorialKey) {
      writeTutorialProgress(starterTutorialKey, { step: 2, completed: true });
    }
    setStarterTutorialStep(2);
    setStarterTutorialOpen(false);
  };

  const navigateFromStarterTutorial = (path: string) => {
    if (path !== "/pos" && !isManagerAccessActive) {
      const pending = { path, step: starterTutorialStep };
      setPendingStarterTutorialNavigation(pending);
      if (starterTutorialKey) {
        writePendingTutorialNavigation(starterTutorialKey, pending);
      }
      setStarterTutorialOpen(false);
      setLocation("/settings");
      const destination = path === "/products" ? "Products" : "Reports";
      toast.info(`Unlock manager access in Settings. Violet will continue to ${destination} afterward.`);
      return false;
    }
    const nextStep = Math.min(starterTutorialStep + 1, 2);
    updateStarterTutorialStep(nextStep);
    setStarterTutorialOpen(false);
    setLocation(path);
    return true;
  };
  
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
    } else if (user?.mustChangePassword && location !== "/change-password") {
      setLocation("/change-password");
    } else if (tenant?.requiresBillingAction && !isSuperAdmin && location !== "/subscription") {
      setLocation("/subscription");
    }
  }, [token, tenant?.requiresBillingAction, user?.mustChangePassword, isSuperAdmin, location, setLocation]);

  useEffect(() => {
    if (!token || !isSuperAdmin) return;

    let timeoutId = 0;
    const logOutForInactivity = () => {
      logoutRef.current();
      setLocationRef.current("/login");
    };
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(logOutForInactivity, SUPER_ADMIN_IDLE_TIMEOUT_MS);
    };

    for (const eventName of SUPER_ADMIN_ACTIVITY_EVENTS) {
      window.addEventListener(eventName, resetTimer, { passive: true });
    }
    resetTimer();

    return () => {
      window.clearTimeout(timeoutId);
      for (const eventName of SUPER_ADMIN_ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, resetTimer);
      }
    };
  }, [isSuperAdmin, token]);

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
    "/advanced",
  ].some((route) => location === route || location.startsWith(`${route}/`));

  useEffect(() => {
    if (token && !user?.mustChangePassword && isManagementRoute && !isManagerAccessActive) {
      setLocation("/settings");
    }
  }, [isManagementRoute, isManagerAccessActive, setLocation, token, user?.mustChangePassword]);

  if (!token) return null;
  if (user?.mustChangePassword && location !== "/change-password") return null;
  if (isManagementRoute && !isManagerAccessActive) return null;

  const isPosRoute = location === "/pos" || location.startsWith("/pos/");
  const showBackButton = !isPosRoute && !(location === "/subscription" && tenant?.requiresBillingAction);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header
            hasActiveShift={Boolean(currentShift)}
            onClockOut={() => setSettlementDialogOpen(true)}
            onOpenTutorial={openStarterTutorial}
          />
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
      <CashierShiftDialog
        open={settlementDialogOpen}
        onOpenChange={setSettlementDialogOpen}
        currentShift={currentShift}
      />
      <StarterTutorial
        open={starterTutorialOpen}
        onOpenChange={(open) => {
          setStarterTutorialOpen(open);
          if (!open && starterTutorialKey) {
            writeTutorialProgress(starterTutorialKey, { step: starterTutorialStep, completed: false });
          }
        }}
        activeStep={starterTutorialStep}
        onStepChange={updateStarterTutorialStep}
        onNavigate={navigateFromStarterTutorial}
        onComplete={completeStarterTutorial}
      />
    </div>
  );
}
