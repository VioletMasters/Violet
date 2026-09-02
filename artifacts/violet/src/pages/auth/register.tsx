import React from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createBillingCheckout, useRegister } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { getRequestedPaidTier, planLabel } from "@/lib/billing";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const registerSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const selectedTier = getRequestedPaidTier();
  const [isOpeningCheckout, setIsOpeningCheckout] = React.useState(false);
  
  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema)
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: async (data) => {
        setAuth(data.user, data.tenant, data.token);
        toast.success("Business account created successfully!");
        if (!selectedTier) {
          setLocation("/download");
          return;
        }

        setIsOpeningCheckout(true);
        try {
          const checkout = await createBillingCheckout({ tier: selectedTier });
          window.location.assign(checkout.checkoutUrl);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Secure checkout is unavailable.");
          setLocation(`/subscription?checkout=error&tier=${selectedTier}`);
        }
      },
      onError: (error) => {
        toast.error(error.message || "Failed to register. Please try again.");
      }
    }
  });

  const onSubmit = (data: RegisterForm) => {
    registerMutation.mutate({
      data: {
        ...data,
        requestedPaidTier: selectedTier ?? undefined,
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 py-12">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center mb-8">
          <Link href="/">
            <div className="w-12 h-12 rounded bg-primary flex items-center justify-center mb-4 cursor-pointer">
              <div className="w-4 h-4 rounded-full bg-white" />
            </div>
          </Link>
          <h1 className="text-3xl font-display font-bold text-center tracking-tight">Create your account</h1>
          <p className="text-muted-foreground mt-2">Set up Violet Enterprise for your business</p>
          {selectedTier && (
            <div className="mt-3 space-y-2 text-center">
              <p className="rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                {planLabel(selectedTier)} plan selected — checkout follows account creation
              </p>
              <p className="text-xs text-muted-foreground">
                Unfinished paid signups are removed after 24 hours.
              </p>
            </div>
          )}
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input 
                id="businessName" 
                placeholder="Acme Co." 
                {...register("businessName")}
                className={errors.businessName ? "border-destructive" : ""}
              />
              {errors.businessName && (
                <p className="text-xs text-destructive">{errors.businessName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input 
                  id="firstName" 
                  {...register("firstName")}
                  className={errors.firstName ? "border-destructive" : ""}
                />
                {errors.firstName && (
                  <p className="text-xs text-destructive">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input 
                  id="lastName" 
                  {...register("lastName")}
                  className={errors.lastName ? "border-destructive" : ""}
                />
                {errors.lastName && (
                  <p className="text-xs text-destructive">{errors.lastName.message}</p>
                )}
              </div>
            </div>

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
              <Label htmlFor="password">Password</Label>
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
              className="w-full h-11 text-base mt-2" 
              disabled={registerMutation.isPending || isOpeningCheckout}
            >
              {registerMutation.isPending
                ? "Creating account..."
                : isOpeningCheckout
                  ? "Opening secure checkout..."
                  : selectedTier
                    ? `Continue to ${planLabel(selectedTier)} checkout`
                    : "Create free account"}
            </Button>
          </form>
        </div>

        <p className="text-center mt-8 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={selectedTier ? `/login?plan=${selectedTier}` : "/login"} className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}