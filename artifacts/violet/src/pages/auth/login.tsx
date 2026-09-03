import React from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createBillingCheckout, useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { getRequestedPaidTier, planLabel } from "@/lib/billing";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const selectedTier = getRequestedPaidTier();
  const [isOpeningCheckout, setIsOpeningCheckout] = React.useState(false);
  
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: async (data) => {
        setAuth(data.user, data.tenant, data.token);
        toast.success("Welcome back to Violet Enterprise");
        if (data.user.mustChangePassword) {
          setLocation("/change-password");
          return;
        }
        if (selectedTier) {
          setIsOpeningCheckout(true);
          try {
            const checkout = await createBillingCheckout({ tier: selectedTier });
            window.location.assign(checkout.checkoutUrl);
            return;
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Secure checkout is unavailable.");
            setLocation(`/subscription?checkout=error&tier=${selectedTier}`);
            return;
          }
        }
        setLocation(data.tenant.requiresBillingAction && data.user.role !== "super_admin"
          ? "/subscription"
          : data.user.role === "super_admin"
            ? "/admin"
            : "/pos");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to login. Please check your credentials.");
      }
    }
  });

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate({ data });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Link href="/">
            <div className="w-12 h-12 rounded bg-primary flex items-center justify-center mb-4 cursor-pointer">
              <div className="w-4 h-4 rounded-full bg-white" />
            </div>
          </Link>
          <h1 className="text-3xl font-display font-bold text-center tracking-tight">Sign in to Violet</h1>
          <p className="text-muted-foreground mt-2">Welcome back to your command center</p>
          {selectedTier && (
            <p className="mt-3 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              Sign in to continue to {planLabel(selectedTier)} checkout
            </p>
          )}
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="name@company.com" 
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="#" className="text-xs text-primary hover:underline">Forgot password?</Link>
              </div>
              <Input 
                id="password" 
                type="password" 
                {...register("password")}
                className={errors.password ? "border-destructive" : ""}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 text-base" 
              disabled={loginMutation.isPending || isOpeningCheckout}
            >
              {loginMutation.isPending
                ? "Signing in..."
                : isOpeningCheckout
                  ? "Opening secure checkout..."
                  : selectedTier
                    ? "Sign in and continue"
                    : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="text-center mt-8 text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link href={selectedTier ? `/register?plan=${selectedTier}` : "/register"} className="text-primary hover:underline font-medium">
            Register your business
          </Link>
        </p>
      </div>
    </div>
  );
}