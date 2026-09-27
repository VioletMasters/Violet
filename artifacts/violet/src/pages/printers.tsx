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
  useGetCurrentRegisterShift,
  useRetryPrintJob,
  useUpdatePrinter,
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
import { Check, Printer as PrinterIcon, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { selectEffectivePrinter } from "@/lib/printer-selection";
import {
  dispatchPrintJob,
  discoverDesktopPrinters,
  isDesktopPrinterAvailable,
  nativePrinterErrorMessage,
  testNativePrinter,
} from "@/lib/desktop-print";

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
  const { data: currentShiftResponse } = useGetCurrentRegisterShift();
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
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([]);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [selectedStoreValue, setSelectedStoreValue] = useState("");
  const [selectedRegisterValue, setSelectedRegisterValue] = useState("");
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);
  const [testPrinterMessage, setTestPrinterMessage] = useState<{ printerId: string; kind: "success" | "error"; text: string } | null>(null);
  const desktopPrinterAvailable = isDesktopPrinterAvailable();

  const stores = (storesResponse?.data ?? []) as Array<{ id: string; name?: string }>;
  const registers = (registersResponse?.data ?? []) as Array<{
    id: string;
    name?: string;
    code?: string;
    storeId?: string | null;
  }>;
  const currentShiftScope = currentShiftResponse as {
    shift?: { storeId?: string | null; registerId?: string | null } | null;
  } | undefined;
  const printers = printerResponse?.data ?? [];
  const jobs = jobsResponse?.data ?? [];
  const currentShiftStoreId = currentShiftScope?.shift?.storeId;
  const selectedStoreId = selectedStoreValue || currentShiftStoreId || stores[0]?.id || "global";
  const selectedStore = selectedStoreId === "global" ? null : selectedStoreId;
  const selectedRegisterOptions = selectedStore ? registers.filter((register) => register.storeId === selectedStore) : [];
  const currentShiftRegisterId = selectedRegisterOptions.some((register) => register.id === currentShiftScope?.shift?.registerId)
    ? currentShiftScope?.shift?.registerId
    : undefined;
  const selectedRegisterId = selectedRegisterValue || currentShiftRegisterId || selectedRegisterOptions[0]?.id || "all";
  const selectedRegister = selectedRegisterId === "all" ? null : selectedRegisterId;
  const selectedStoreName = stores.find((store) => store.id === selectedStore)?.name ?? "All stores";
  const selectedRegisterName = selectedRegisterOptions.find((register) => register.id === selectedRegister)?.name
    ?? selectedRegisterOptions.find((register) => register.id === selectedRegister)?.code
    ?? "All registers";
  const effectiveReceiptPrinter = useMemo(
    () => selectEffectivePrinter(printers, "customer_receipt", selectedStore, selectedRegister),
    [printers, selectedStore, selectedRegister],
  );
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
  const updatePrinterMutation = useUpdatePrinter({
    mutation: {
      onSuccess: (_updated, variables) => {
        const current = printers.find((printer) => printer.id === variables.id);
        if (variables.data.isActive === false && current?.isActive) {
          toast.success(`${variables.data.name} paused. Violet will use the next active printer for this scope.`);
        } else if (variables.data.isActive === true && current?.isActive === false) {
          toast.success(`${variables.data.name} reactivated and available in its existing scope.`);
        } else if (variables.data.isDefault) {
          toast.success(`${variables.data.name} is now the default printer for its existing scope.`);
        } else {
          toast.success(`${variables.data.name} printer settings updated.`);
        }
        refresh();
      },
      onError: (error) => toast.error(error.message || "Could not switch the default printer"),
    },
  });
  const retryMutation = useRetryPrintJob({
    mutation: {
      onSuccess: async (job) => {
        if (!desktopPrinterAvailable) {
          toast.info("The retry is queued. Open Printers in the Windows app to send it.");
          refresh();
          return;
        }
        try {
          const sent = await dispatchPrintJob(job);
          if (sent) {
            toast.success("Retry sent to Windows. Check the printer or Windows queue for paper output.");
          } else {
            toast.error("Windows did not accept this print job. Check the printer name and print history.");
          }
        } catch (error) {
          toast.error(nativePrinterErrorMessage(error, "The Windows printer could not accept this retry."));
        }
        refresh();
      },
      onError: (error) => toast.error(error.message || "Could not retry print job"),
    },
  });

  const updatePrinterConfiguration = (
    printer: (typeof printers)[number],
    changes: { isActive?: boolean; isDefault?: boolean },
  ) => {
    const data: PrinterInput = {
      name: printer.name,
      role: printer.role as PrinterRole,
      connectionType: printer.connectionType,
      deviceName: printer.deviceName,
      deviceAddress: printer.deviceAddress ?? undefined,
      platform: printer.platform ?? undefined,
      storeId: printer.storeId,
      registerId: printer.registerId,
      isActive: changes.isActive ?? printer.isActive,
      ...(changes.isDefault === undefined ? {} : { isDefault: changes.isDefault }),
    };
    updatePrinterMutation.mutate({ id: printer.id, data });
  };

  const makeDefaultForPrinterScope = (printer: (typeof printers)[number]) => {
    updatePrinterConfiguration(printer, { isDefault: true });
  };

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

  const detectPrinters = async () => {
    if (!desktopPrinterAvailable) {
      window.print();
      toast.info("Browsers can show printers in the system print dialog, but cannot return the selected printer name to Violet.");
      return;
    }
    setIsDetecting(true);
    setDetectError(null);
    try {
      const detected = await discoverDesktopPrinters();
      const names = detected.map((printer) => printer.name);
      setDetectedPrinters(names);
      if (detected[0] && !form.deviceName) update("deviceName", detected[0].name);
      if (detected.length === 0) {
        toast.warning("No Windows printers were detected.");
      } else {
        toast.success(`${detected.length} Windows printer${detected.length === 1 ? "" : "s"} found. Choose one below.`);
      }
    } catch (error) {
      const message = nativePrinterErrorMessage(error);
      setDetectedPrinters([]);
      setDetectError(message);
      toast.error("Printer detection failed. See the error below.");
    } finally {
      setIsDetecting(false);
    }
  };

  const printTestPage = async (printer: (typeof printers)[number]) => {
    setTestingPrinterId(printer.id);
    setTestPrinterMessage(null);
    try {
      await testNativePrinter(printer.deviceName);
      setTestPrinterMessage({
        printerId: printer.id,
        kind: "success",
        text: `Windows accepted a test print for "${printer.deviceName}". This confirms submission only; check the printer or Windows queue to confirm paper came out.`,
      });
      toast.success(`Test sent to ${printer.deviceName}`);
    } catch (error) {
      const message = nativePrinterErrorMessage(error, `Windows could not send a test to "${printer.deviceName}".`);
      setTestPrinterMessage({ printerId: printer.id, kind: "error", text: message });
      toast.error(message);
    } finally {
      setTestingPrinterId(null);
    }
  };

  const jobPrinterName = (job: (typeof jobs)[number]) => {
    try {
      const payload = JSON.parse(job.payload) as { printerName?: string };
      return payload.printerName?.trim() || "No printer assigned";
    } catch {
      return "Printer unavailable";
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Printers</h1>
        <p className="mt-1 text-muted-foreground">Route receipts and operational tickets without affecting checkout when a printer is offline.</p>
      </div>

      <Card className="border-primary/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PrinterIcon className="h-5 w-5 text-primary" /> Receipt printer in use</CardTitle>
          <CardDescription>
            Violet routes each sale to the best active printer for its store and register. A register-specific printer overrides a store or global printer.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Store</Label>
              <Select
                value={selectedStoreId}
                onValueChange={(value) => {
                  setSelectedStoreValue(value);
                  setSelectedRegisterValue("all");
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">All stores</SelectItem>
                  {stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name ?? store.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Register</Label>
              <Select value={selectedRegisterId} onValueChange={setSelectedRegisterValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All registers</SelectItem>
                  {selectedRegisterOptions.map((register) => (
                    <SelectItem key={register.id} value={register.id}>
                      {register.name ?? register.code ?? register.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-medium">
              {selectedStoreName} · {selectedRegisterName}
            </p>
            {effectiveReceiptPrinter ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="default"><Check className="mr-1 h-3 w-3" /> In use</Badge>
                <span className="font-semibold">{effectiveReceiptPrinter.name}</span>
                <span className="text-sm text-muted-foreground">({effectiveReceiptPrinter.deviceName})</span>
              </div>
            ) : (
              <p role="status" className="mt-2 text-sm text-destructive">
                No active customer receipt printer matches this selection. Add one or activate an existing printer before checkout.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              This selection follows the same scope and default priority used for sales. A default applies only within its own scope; more-specific printer scopes take priority. To fall back to a broader printer, pause the more-specific override below. It stays configured and can be reactivated later.
            </p>
          </div>
        </CardContent>
      </Card>

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
                  <div className="flex items-center justify-between gap-2">
                    <Label>Native device name</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void detectPrinters()} disabled={isDetecting}>
                      {isDetecting ? "Detecting..." : desktopPrinterAvailable ? "Detect" : "Open printer dialog"}
                    </Button>
                  </div>
                  {detectedPrinters.length > 0 ? (
                    <Select
                      value={detectedPrinters.includes(form.deviceName ?? "") ? form.deviceName ?? undefined : undefined}
                      onValueChange={(value) => update("deviceName", value)}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose a detected Windows printer" /></SelectTrigger>
                      <SelectContent>
                        {detectedPrinters.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form.deviceName} onChange={(event) => update("deviceName", event.target.value)} placeholder="EPSON TM-T20III" />
                  )}
                  {!desktopPrinterAvailable && (
                    <p className="text-xs text-muted-foreground">
                      Browsers can open the system print dialog, but Windows does not allow websites to read or save the selected printer. Use the desktop app for automatic detection.
                    </p>
                  )}
                  {detectError && (
                    <p role="alert" className="break-words rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                      Printer detection failed: {detectError}
                    </p>
                  )}
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
                  <div key={printer.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><PrinterIcon className="h-5 w-5 text-primary" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{printer.name}</p>
                          {printer.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}
                          {printer.isDefault && <Badge variant="secondary">Default for this scope</Badge>}
                          {effectiveReceiptPrinter?.id === printer.id && (
                            <Badge><Check className="mr-1 h-3 w-3" /> In use for selection</Badge>
                          )}
                        </div>
                        <p className="mt-1 break-all text-sm font-medium">{printer.deviceName}</p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabels[printer.role] ?? printer.role} · {printer.registerId ? "Register-specific" : printer.storeId ? "Store-specific" : "Global"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={effectiveReceiptPrinter?.id === printer.id ? "secondary" : "outline"}
                          disabled={!printer.isActive || Boolean(printer.isDefault) || updatePrinterMutation.isPending}
                          title={
                            !printer.isActive
                              ? "Reactivate this printer before making it the default."
                              : printer.isDefault && effectiveReceiptPrinter?.id !== printer.id
                                ? "Already the default for its own scope, but a more-specific active route takes priority. Pause that override to fall back to this printer."
                                : printer.isDefault
                                  ? "Already in use for the selected store and register."
                                  : undefined
                          }
                          onClick={() => makeDefaultForPrinterScope(printer)}
                        >
                          {effectiveReceiptPrinter?.id === printer.id
                            ? "In use"
                            : printer.isDefault
                              ? "Default for its scope"
                              : "Use this printer"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={printer.isActive ? "outline" : "secondary"}
                          disabled={updatePrinterMutation.isPending}
                          onClick={() => updatePrinterConfiguration(printer, { isActive: !printer.isActive })}
                        >
                          {printer.isActive ? "Pause" : "Reactivate"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!desktopPrinterAvailable || testingPrinterId !== null}
                          title={desktopPrinterAvailable ? "Send a test document directly to this Windows printer" : "Test printing is available in Violet's Windows desktop app"}
                          onClick={() => void printTestPage(printer)}
                        >
                          <PrinterIcon className="mr-1 h-3.5 w-3.5" />
                          {testingPrinterId === printer.id ? "Sending..." : "Print test"}
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Remove ${printer.name}`} onClick={() => deleteMutation.mutate({ id: printer.id })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {printer.role === "customer_receipt" && printer.isActive && printer.isDefault && effectiveReceiptPrinter?.id !== printer.id && (
                      <p className="mt-2 pl-[3.25rem] text-xs text-muted-foreground">
                        This is the default for its scope, but a more-specific active printer is in use. Pause that override to let Violet fall back to this printer.
                      </p>
                    )}
                    {testPrinterMessage?.printerId === printer.id && (
                      <p
                        role={testPrinterMessage.kind === "error" ? "alert" : "status"}
                        className={`mt-3 break-words rounded-md border p-2 text-xs ${
                          testPrinterMessage.kind === "error"
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
                        }`}
                      >
                        {testPrinterMessage.text}
                      </p>
                    )}
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
            <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Printer</TableHead><TableHead>Created</TableHead><TableHead>Status</TableHead><TableHead>Error</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {jobs.length === 0 ? <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">No print jobs yet.</TableCell></TableRow> : jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell><p className="font-medium">{roleLabels[job.documentType.replace("_ticket", "")] ?? job.documentType}</p><p className="font-mono text-xs text-muted-foreground">{job.saleId ?? "—"}</p></TableCell>
                  <TableCell className="max-w-56">
                    <p className="break-words font-medium">{jobPrinterName(job)}</p>
                    {jobPrinterName(job) !== "No printer assigned" && (
                      <p className="text-xs text-muted-foreground">Configured Windows device</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(job.status)}>
                      {job.status === "printed" && jobPrinterName(job) !== "No printer assigned" ? "Sent to Windows" : job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal break-words text-xs text-destructive">{job.errorMessage ?? "—"}</TableCell>
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