import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { useGetSettings, useUnlockManagerAccess, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Banknote,
  BarChart3,
  Boxes,
  LayoutDashboard,
  Package,
  Receipt,
  Settings2,
  ShieldCheck,
  Store,
  Truck,
  UserRoundCog,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const settingsSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  businessEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  businessPhone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  currency: z.string().min(3),
  taxRate: z.coerce.number().min(0).max(100),
  taxName: z.string().optional().or(z.literal("")),
  receiptFooter: z.string().optional().or(z.literal("")),
  requireManagerPasswordForCartRemoval: z.boolean(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

const managementLinks = [
  { href: "/dashboard", label: "Dashboard", description: "Sales and store performance at a glance.", icon: LayoutDashboard },
  { href: "/products", label: "Products", description: "Catalog, pricing, and barcode management.", icon: Package },
  { href: "/inventory", label: "Inventory", description: "Stock levels, low-stock alerts, and adjustments.", icon: Boxes },
  { href: "/customers", label: "Customers", description: "Customer records and relationship management.", icon: Users },
  { href: "/employees", label: "Employees", description: "Manage your team and employee details.", icon: UserRoundCog },
  { href: "/suppliers", label: "Suppliers", description: "Maintain supplier contacts and purchasing partners.", icon: Truck },
  { href: "/reports", label: "Reports", description: "Review sales, inventory, and business reporting.", icon: BarChart3 },
  { href: "/subscription", label: "Subscription", description: "Review your Violet plan and billing.", icon: Settings2 },
];

export default function SettingsPage() {
  const { user, isManagerAccessActive, setManagerAccess } = useAuth();
  const [managerEmail, setManagerEmail] = useState(user?.email ?? "");
  const [managerPassword, setManagerPassword] = useState("");
  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: ["/api/settings"], enabled: isManagerAccessActive },
  });

  const unlockMutation = useUnlockManagerAccess({
    mutation: {
      onSuccess: (data) => {
        setManagerAccess(data.accessToken, data.expiresAt);
        setManagerPassword("");
        toast.success("Manager access unlocked for 15 minutes.");
      },
      onError: () => {
        toast.error("Those manager credentials could not be verified.");
      },
    },
  });
  
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { requireManagerPasswordForCartRemoval: false },
  });

  useEffect(() => {
    if (settings) {
      reset({
        businessName: settings.businessName || "",
        businessEmail: settings.businessEmail || "",
        businessPhone: settings.businessPhone || "",
        address: settings.address || "",
        currency: settings.currency || "USD",
        taxRate: settings.taxRate || 0,
        taxName: settings.taxName || "Tax",
        receiptFooter: settings.receiptFooter || "",
        requireManagerPasswordForCartRemoval: settings.requireManagerPasswordForCartRemoval,
      });
    }
  }, [settings, reset]);

  const updateMutation = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        toast.success("Settings updated successfully");
      },
      onError: (e) => {
        toast.error(e.message || "Failed to update settings");
      }
    }
  });

  const onSubmit = (data: SettingsForm) => {
    updateMutation.mutate({ data });
  };

  const unlockManagement = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    unlockMutation.mutate({
      data: {
        email: managerEmail.trim(),
        password: managerPassword,
      },
    });
  };

  if (!isManagerAccessActive) {
    return (
      <div className="mx-auto max-w-md pt-8">
        <Card className="border-primary/25 shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Manager access required</CardTitle>
            <CardDescription>
              Point of Sale remains available. Enter a manager, administrator, or owner account to open business settings and management tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={unlockManagement}>
              <div className="space-y-2">
                <Label htmlFor="manager-email">Manager email</Label>
                <Input
                  id="manager-email"
                  type="email"
                  autoComplete="username"
                  value={managerEmail}
                  onChange={(event) => setManagerEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager-password">Manager password</Label>
                <Input
                  id="manager-password"
                  type="password"
                  autoComplete="current-password"
                  value={managerPassword}
                  onChange={(event) => setManagerPassword(event.target.value)}
                  required
                />
              </div>
              <Button className="w-full" type="submit" disabled={unlockMutation.isPending}>
                {unlockMutation.isPending ? "Verifying access..." : "Unlock Settings"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Access expires automatically after 15 minutes or when you sign out.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Business management tools and store configuration.</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Business Management</h2>
          <p className="text-sm text-muted-foreground">Open a tool to manage your store outside the checkout flow.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {managementLinks.map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href}>
              <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/30">
                <CardHeader className="space-y-2 p-4">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{label}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Store className="w-5 h-5 text-primary" /> Store Information</CardTitle>
            <CardDescription>Public details that may appear on receipts and invoices.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Business Name</Label>
              <Input {...register("businessName")} />
              {errors.businessName && <p className="text-xs text-destructive">{errors.businessName.message}</p>}
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Business Email</Label>
                <Input type="email" {...register("businessEmail")} />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input type="tel" {...register("businessPhone")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Physical Address</Label>
              <Input {...register("address")} placeholder="123 Main St, City, Country" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Banknote className="w-5 h-5 text-primary" /> Financial Setup</CardTitle>
            <CardDescription>Currency and tax configurations for POS and reports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency Code</Label>
                <Select 
                  defaultValue={settings?.currency || "USD"} 
                  onValueChange={(val) => setValue("currency", val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="JPY">JPY (£)</SelectItem>
                    <SelectItem value="CAD">CAD (£)</SelectItem>
                    <SelectItem value="AUD">CAD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Tax Name</Label>
                  <Input {...register("taxName")} placeholder="e.g. VAT, GST, Sales Tax" />
                </div>
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <Input type="number" step="0.01" {...register("taxRate")} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> POS Permissions</CardTitle>
            <CardDescription>Control whether cashiers can change a sale after an item has been added to the cart.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-6 rounded-lg border bg-secondary/20 p-4">
              <div className="space-y-1">
                <Label htmlFor="require-manager-cart-removal" className="text-sm font-medium">
                  Require manager password to remove cart items
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, a manager must confirm their password before a cashier can remove an item or reduce its quantity to zero.
                </p>
              </div>
              <Switch
                id="require-manager-cart-removal"
                checked={watch("requireManagerPasswordForCartRemoval")}
                onCheckedChange={(checked) => setValue("requireManagerPasswordForCartRemoval", checked, { shouldDirty: true })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Receipt className="w-5 h-5 text-primary" /> Receipt Customization</CardTitle>
            <CardDescription>Customize what prints at the bottom of customer receipts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Receipt Footer Message</Label>
              <Input {...register("receiptFooter")} placeholder="Thank you for shopping with us! Returns accepted within 14 days." />
            </div>
          </CardContent>
          <CardFooter className="bg-secondary/30 mt-6 py-4 flex justify-end border-t border-border/50">
            <Button type="submit" disabled={updateMutation.isPending} className="w-full sm:w-auto px-8">
              {updateMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}