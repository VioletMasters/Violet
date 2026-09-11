import React from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  createBillingCheckout,
  useResendEmailVerification,
  useVerifyEmail,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { getRequestedPaidTier, planLabel } from "@/lib/billing";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const resendSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ResendForm = z.infer<typeof resendSchema>;

function continueAfterVerification(
  setAuth: ReturnType<typeof useAuth>["setAuth"],
  setLocation: (path: string) => void,
  data: Awaited<ReturnType<typeof import("@workspace/api-client-react").verifyEmail>>,
  selectedTier: ReturnType<typeof getRequestedPaidTier>,
  setIsOpeningCheckout: React.Dispatch<React.SetStateAction<boolean>>,
) {
  setAuth(data.user, data.tenant, data.token);
  sessionStorage.removeItem("violet_pending_verification_email");
  if (selectedTier) {
    setIsOpeningCheckout(true);
    void createBillingCheckout({ tier: selectedTier }).then(
      (checkout) => window.location.assign(checkout.checkoutUrl),
      (error) => {
        toast.error(error instanceof Error ? error.message : "Secure checkout is unavailable.");
        setLocation(`/subscription?checkout=error&tier=${selectedTier}`);
      },
    );
    return;
  }
  setLocation("/download");
}

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const selectedTier = getRequestedPaidTier();
  const token = React.useMemo(
    () => new URLSearchParams(window.location.search).get("token")?.trim() ?? "",
    [],
  );
  const tokenIsValidShape = /^[a-f0-9]{64}$/i.test(token);
  const [isOpeningCheckout, setIsOpeningCheckout] = React.useState(false);
  const [verificationStarted, setVerificationStarted] = React.useState(false);
  const [pendingEmail] = React.useState(() => {
    const queryEmail = new URLSearchParams(window.location.search).get("email")?.trim() ?? "";
    return queryEmail || sessionStorage.getItem("violet_pending_verification_email") || "";
  });
  const { register, handleSubmit, formState: { errors } } = useForm<ResendForm>({
    resolver: zodResolver(resendSchema),
    defaultValues: { email: pendingEmail },
  });

  const verifyMutation = useVerifyEmail({
    mutation: {
      onSuccess: (data) => {
        toast.success("Email verified. Welcome to Violet Enterprise.");
        continueAfterVerification(setAuth, setLocation, data, selectedTier, setIsOpeningCheckout);
      },
      onError: (error) => toast.error(error.message || "This verification link is invalid or expired."),
    },
  });

  const resendMutation = useResendEmailVerification({
    mutation: {
      onSuccess: (data) => toast.success(
        data.verificationEmailSent
          ? "If that account is waiting for verification, a new email is on its way."
          : "We could not send the verification email yet. Please contact support or try again later.",
      ),
      onError: (error) => toast.error(error.message || "The verification email could not be sent."),
    },
  });

  React.useEffect(() => {
    if (!tokenIsValidShape || verificationStarted) return;
    setVerificationStarted(true);
    verifyMutation.mutate({ data: { token } });
  }, [token, tokenIsValidShape, verificationStarted, verifyMutation]);

  const onResend = ({ email }: ResendForm) => {
    resendMutation.mutate({ data: { email: email.trim() } });
  };

  const isVerifying = tokenIsValidShape && (verificationStarted || verifyMutation.isPending);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Link href="/">
            <div className="w-12 h-12 rounded bg-primary flex items-center justify-center mb-4 cursor-pointer">
              <div className="w-4 h-4 rounded-full border-2 border-white" />
            </div>
          </Link>
          <h1 className="text-3xl font-display font-bold text-center tracking-tight">
            {tokenIsValidShape ? "Verifying your email" : "Check your email"}
          </h1>
          <p className="text-muted-foreground mt-2 text-center">
            {tokenIsValidShape
              ? "This will only take a moment."
              : "Confirm your email address before you start using Violet Enterprise."}
          </p>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-8 shadow-xl">
          {tokenIsValidShape ? (
            <div className="space-y-5 text-center">
              <p className="text-sm leading-6 text-muted-foreground">
                {isVerifying
                  ? "Confirming your one-time verification link..."
                  : "This link could not be used. Request a new verification email below."}
              </p>
              {!verifyMutation.isPending && verifyMutation.isError && (
                <Button variant="outline" className="w-full" onClick={() => setLocation("/verify-email")}>
                  Request a new link
                </Button>
              )}
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit(onResend)}>
              <p className="text-sm leading-6 text-muted-foreground">
                We sent a one-time link to your email. It expires in 24 hours.
              </p>
              {selectedTier && (
                <p className="rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-center text-sm font-medium text-primary">
                  {planLabel(selectedTier)} checkout will open after verification.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="verification-email">Email address</Label>
                <Input
                  id="verification-email"
                  type="email"
                  autoComplete="email"
                  {...register("email")}
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="w-full h-11" disabled={resendMutation.isPending || isOpeningCheckout}>
                {resendMutation.isPending ? "Sending verification email..." : "Resend verification email"}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center mt-8 text-sm text-muted-foreground">
          Already verified?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}