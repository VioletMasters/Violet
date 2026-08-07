import React, { useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Store, Receipt, Banknote } from "lucide-react";

const settingsSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  businessEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  businessPhone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  currency: z.string().min(3),
  taxRate: z.coerce.number().min(0).max(100),
  taxName: z.string().optional().or(z.literal("")),
  receiptFooter: z.string().optional().or(z.literal("")),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { data: settings, isLoading } = useGetSettings();
  
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
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

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Business Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your store preferences and receipts.</p>
      </div>

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