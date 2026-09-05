import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRequestPasswordReset } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submittedEmail, setSubmittedEmail] = useState("");
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const mutation = useRequestPasswordReset({
    mutation: {
      onSuccess: (_, variables) => setSubmittedEmail(variables.data.email),
      onError: (error) => toast.error(error.message || "The reset email could not be sent."),
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
          <h1 className="text-center font-display text-3xl font-bold tracking-tight">Reset your password</h1>
          <p className="mt-2 text-center text-muted-foreground">
            We’ll email you a secure, one-time reset link.
          </p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-8 shadow-xl">
          {submittedEmail ? (
            <div className="space-y-5 text-center">
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                If a Violet account exists for <span className="font-medium text-foreground">{submittedEmail}</span>,
                a password reset link is on its way. The link expires in 30 minutes.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setSubmittedEmail("")}>
                Try another email
              </Button>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit((data) => mutation.mutate({ data }))}>
              <div className="space-y-2">
                <Label htmlFor="email">Work Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  {...register("email")}
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="h-11 w-full text-base" disabled={mutation.isPending}>
                {mutation.isPending ? "Sending reset link..." : "Send reset link"}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Remembered your password?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">Return to sign in</Link>
        </p>
      </div>
    </div>
  );
}