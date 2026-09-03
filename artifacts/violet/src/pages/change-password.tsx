import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useChangePassword } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your temporary password"),
  newPassword: z.string().min(10, "Use at least 10 characters"),
  confirmPassword: z.string().min(1, "Confirm your new password"),
}).refine((values) => values.newPassword === values.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const [, setLocation] = useLocation();
  const { user, updateUser } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const mutation = useChangePassword({
    mutation: {
      onSuccess: (updatedUser) => {
        updateUser(updatedUser);
        toast.success("Password updated");
        setLocation(updatedUser.role === "super_admin" ? "/admin" : "/pos");
      },
      onError: (error) => toast.error(error.message || "Password could not be updated"),
    },
  });

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center">
      <div className="w-full rounded-2xl border bg-card p-8 shadow-xl">
        <h1 className="text-2xl font-display font-bold">Create your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Welcome, {user?.firstName}. Replace the temporary password before continuing.
        </p>
        <form
          className="mt-7 space-y-5"
          onSubmit={handleSubmit(({ confirmPassword: _, ...data }) => mutation.mutate({ data }))}
        >
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Temporary password</Label>
            <Input id="currentPassword" type="password" autoComplete="current-password" {...register("currentPassword")} />
            {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword.message}</p>}
          </div>
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
          <Button className="w-full" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Updating..." : "Set password and continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}