import { useMemo, useState } from "react";
import {
  getListPrintersQueryKey,
  getListPrintJobsQueryKey,
  PrinterRole,
  useCreatePrinter,
  useDeletePrinter,
  useListPrinters,
  useListPrintJobs,
  useListRegisters,
  useListStores,
  useRetryPrintJob,
} from "@workspace/api-client-react";
import type { PrinterInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer as PrinterIcon, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

const roleLabels: Record<string, string> = {
  customer_receipt: "Customer receipt",
  warehouse: "Warehouse",
  kitchen: "Kitchen",
  packing: "Packing",
  office: "Office",
  custom: "Custom",
};

const statusVariant = (status: string) => {
  if (status === "printed") return "secondary" as const;
  if (status === "failed") return "destructive" as const;
  return "outline" as const;
};

export default function PrintersPage() {
  const queryClient = useQueryClient();
  const { data: printerResponse, isLoading } = useListPrinters();
  const { data: jobsResponse } = useListPrintJobs({ limit: 50 });
  const { data: storesResponse } = useListStores();
  const { data: registersResponse } = useListRegisters();
  const [form, setForm] = useState<PrinterInput>({
    name: "",
    role: "customer_receipt",
    connectionType: "os",
    deviceName: "",
    storeId: null,
    registerId: null,
    isDefault: true,
    isActive: true,
  });

  const stores = Array.isArray(storesResponse) ? storesResponse : [];
  const registers = Array.isArray(registersResponse) ? registersResponse : [];
  const printers = printerResponse?.data ?? [];
  const jobs = jobsResponse?.data ?? [];
  const selectedStoreRegisters = useMemo(
    () => registers.filter((register) => !form.storeId || (register as { storeId?: string }).storeId === form.storeId),
    [form.storeId, registers],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListPrintersQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListPrintJobsQueryKey({ limit: 50 }) });
  };

  const createMutation = useCreatePrinter({
    mutation: {
      onSuccess: () => {
        toast.success("Printer saved");
        setForm({ name: "", role: "customer_receipt", connectionType: "os", deviceName: "", storeId: null, registerId: null, isDefault: true, isActive: true });
        refresh();
      },
      onError: (error) => toast.error(error.message || "Could not save printer"),
    },
  });
  const deleteMutation = useDeletePrinter({
    mutation: {
      onSuccess: () => {
        toast.success("Printer removed");
        refresh();
      },
      onError: (error) => toast.error(error.message || "Could not remove printer"),
    },
  });
  const retryMutation = useRetryPrintJob({
    mutation: {
      onSuccess: () => {
        toast.success("Print job queued again");
        refresh();
      },
      onError: (error) => toast.error(error.message || "Could not retry print job"),
    },
  });

  const update = <K extends keyof PrinterInput>(key: K, value: PrinterInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.deviceName.trim()) {
      toast.error("Enter a printer name and device name.");
      return;
    }
    createMutation.mutate({ data: form });
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Printers</h1>
        <p className="mt-1 text-muted-foreground">Route receipts and operational tickets without affecting checkout when a printer is offline.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Add printer</CardTitle>
            <CardDescription>Choose a global, store, or register-specific destination. Register routing takes priority.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Front counter receipt printer" />
              </div>
              <div className="space-y-2">
                <Label>Printer role</Label>
                <Select value={form.role} onValueChange={(value) => update("role", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Connection</Label>
                  <Select value={form.connectionType ?? "os"} onValueChange={(value) => update("connectionType", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="os">Operating system</SelectItem>
                      <SelectItem value="usb">USB</SelectItem>
                      <SelectItem value="network">Network</SelectItem>
                      <SelectItem value="shared">Shared</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Native device name</Label>
                  <Input value={form.deviceName} onChange={(event) => update("deviceName", event.target.value)} placeholder="EPSON TM-T20III" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Store scope</Label>
                <Select value={form.storeId ?? "global"} onValueChange={(value) => setForm((current) => ({ ...current, storeId: value === "global" ? null : value, registerId: null }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">All stores</SelectItem>
                    {stores.map((store) => <SelectItem key={(store as { id: string }).id} value={(store as { id: string }).id}>{(store as { name?: string; id: string }).name ?? (store as { id: string }).id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.storeId && (
                <div className="space-y-2">
                  <Label>Register scope (optional)</Label>
                  <Select value={form.registerId ?? "store"} onValueChange={(value) => update("registerId", value === "store" ? null : value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="store">All registers in this store</SelectItem>
                      {selectedStoreRegisters.map((register) => <SelectItem key={(register as { id: string }).id} value={(register as { id: string }).id}>{(register as { name?: string; code?: string; id: string }).name ?? (register as { code?: string; id: string }).code ?? (register as { id: string }).id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <div><Label>Default for this scope</Label><p className="text-xs text-muted-foreground">Used when no more specific printer is configured.</p></div>
                <Switch checked={Boolean(form.isDefault)} onCheckedChange={(checked) => update("isDefault", checked)} />
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full">{createMutation.isPending ? "Saving..." : "Save printer"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configured destinations</CardTitle>
            <CardDescription>{printers.length} printer{printers.length === 1 ? "" : "s"} available to this business.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading printers...</p> : printers.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center"><PrinterIcon className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">No printers configured yet.</p></div>
            ) : (
              <div className="space-y-3">
                {printers.map((printer) => (
                  <div key={printer.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><PrinterIcon className="h-5 w-5 text-primary" /></div>
                    <div className="min-w-0 flex-1"><p className="font-medium">{printer.name}</p><p className="truncate text-xs text-muted-foreground">{roleLabels[printer.role] ?? printer.role} · {printer.deviceName}</p><p className="text-xs text-muted-foreground">{printer.registerId ? "Register-specific" : printer.storeId ? "Store-specific" : "Global"}{printer.isDefault ? " · default" : ""}</p></div>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${printer.name}`} onClick={() => deleteMutation.mutate({ id: printer.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Print history</CardTitle><CardDescription>Completed, queued, and failed jobs remain linked to their original sale.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Created</TableHead><TableHead>Status</TableHead><TableHead>Error</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {jobs.length === 0 ? <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No print jobs yet.</TableCell></TableRow> : jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell><p className="font-medium">{roleLabels[job.documentType.replace("_ticket", "")] ?? job.documentType}</p><p className="font-mono text-xs text-muted-foreground">{job.saleId ?? "—"}</p></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={statusVariant(job.status)}>{job.status}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-destructive">{job.errorMessage ?? "—"}</TableCell>
                  <TableCell className="text-right">{(job.status === "failed" || job.status === "cancelled") && <Button variant="outline" size="sm" onClick={() => retryMutation.mutate({ id: job.id })}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}