import { updatePrintJobStatus } from "@workspace/api-client-react";
import type { PrintJob } from "@workspace/api-client-react";

type TauriGlobal = {
  core?: {
    invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  };
};

function tauri() {
  return (window as Window & { __TAURI__?: TauriGlobal }).__TAURI__;
}

export function isDesktopPrinterAvailable() {
  return Boolean(tauri()?.core?.invoke);
}

export async function discoverDesktopPrinters() {
  const invoke = tauri()?.core?.invoke;
  if (!invoke) return [];
  return invoke<Array<{ name: string }>>("list_native_printers");
}

export async function dispatchPrintJob(job: PrintJob) {
  const invoke = tauri()?.core?.invoke;
  if (!invoke || !job.printerId) return false;
  const payload = JSON.parse(job.payload) as { printerName?: string; items?: Array<{ name?: string; quantity?: number; warehouseLocation?: string | null }>; receiptNumber?: string; totalAmount?: number };
  if (!payload.printerName) return false;

  const lines = [
    "VIOLET ENTERPRISE",
    payload.receiptNumber ? `Receipt: ${payload.receiptNumber}` : job.documentType.replaceAll("_", " ").toUpperCase(),
    "",
    ...(payload.items ?? []).map((item) =>
      `${item.quantity ?? 1} x ${item.name ?? "Item"}${item.warehouseLocation ? ` — ${item.warehouseLocation}` : ""}`),
    ...(payload.totalAmount == null ? [] : ["", `TOTAL: ${payload.totalAmount.toFixed(2)}`]),
  ];

  await updatePrintJobStatus(job.id, { status: "printing" });
  try {
    await invoke("print_native_document", {
      request: { printer_name: payload.printerName, content: lines.join("\n") },
    });
    await updatePrintJobStatus(job.id, { status: "printed" });
    return true;
  } catch (error) {
    await updatePrintJobStatus(job.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Native printer dispatch failed.",
    });
    return false;
  }
}

export async function dispatchSalePrintJobs(jobs: PrintJob[] | undefined) {
  if (!jobs?.length || !isDesktopPrinterAvailable()) return;
  await Promise.all(jobs.filter((job) => job.status === "queued").map(dispatchPrintJob));
}