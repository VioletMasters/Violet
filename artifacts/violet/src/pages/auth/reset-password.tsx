import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useResetPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const schema = z.object({
  newPassword: z.string().min(10, "Use at least 10 characters"),
  confirmPassword: z.string().min(1, "Confirm your new password"),
}).refine((values) => values.newPassword === values.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token")?.trim() ?? "", []);
  const tokenIsValidShape = /^[a-f0-9]{64}$/i.test(token);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const mutation = useResetPassword({
    mutation: {
      onSuccess: () => {
        toast.success("Password reset. Sign in with your new password.");
        setLocation("/login");
      },
      onError: (error) => toast.error(error.message || "This reset link is invalid or expired."),
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Link href="/">
            <div className="mb-4 flex h-12 w-12 cursor-pointer items-center justify-center rounded bg-primary">
              <div className="h-4 w-4 rounded-full bg-white" />
            </div>
          </Link>
          <h1 className="text-center font-display text-3xl font-bold tracking-tight">Choose a new password</h1>
          <p className="mt-2 text-center text-muted-foreground">Use at least 10 characters.</p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-8 shadow-xl">
          {!tokenIsValidShape ? (
            <div className="space-y-5 text-center">
              <h2 className="text-lg font-semibold">Reset link unavailable</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                This password reset link is incomplete or invalid. Request a new link to continue.
              </p>
              <Button asChild className="w-full">
                <Link href="/forgot-password">Request another link</Link>
              </Button>
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={handleSubmit(({ confirmPassword: _, ...data }) => mutation.mutate({
                data: { token, ...data },
              }))}
            >
              <input
                type="email"
                name="username"
                autoComplete="username"
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
              />
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input id="newPassword" type="password" autoComplete="new-password" {...register("newPassword")} />
                {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
              </div>
              <Button type="submit" className="h-11 w-full text-base" disabled={mutation.isPending}>
                {mutation.isPending ? "Resetting password..." : "Reset password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}