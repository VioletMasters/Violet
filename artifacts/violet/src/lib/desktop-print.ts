import { updatePrintJobStatus } from "@workspace/api-client-react";
import type { PrintJob } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

type NativePrintItem = {
  name?: string;
  sku?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  warehouseLocation?: string | null;
};

type NativePrintPayload = {
  printerName?: string;
  items?: NativePrintItem[];
  receiptNumber?: string;
  createdAt?: string;
  totalAmount?: number;
  businessName?: string | null;
  businessPhone?: string | null;
  address?: string | null;
  receiptFooter?: string | null;
  currency?: string;
  paperWidthMm?: 58 | 80;
  itemLayout?: "compact" | "detailed";
  showSku?: boolean;
};

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

export function nativePrinterErrorMessage(error: unknown, fallback = "Could not detect native printers."): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

export async function discoverDesktopPrinters() {
  const invoke = tauri()?.core?.invoke;
  if (!invoke) return [];
  return invoke<Array<{ name: string }>>("list_native_printers");
}

export async function testNativePrinter(printerName: string) {
  const invoke = tauri()?.core?.invoke;
  if (!invoke) throw new Error("Open Violet in the Windows desktop app to print a test receipt.");
  if (!printerName.trim()) throw new Error("Choose a Windows printer first.");
  await invoke("print_native_document", {
    request: {
      printer_name: printerName.trim(),
      content: [
        "VIOLET PRINTER TEST",
        `Printer: ${printerName.trim()}`,
        new Date().toLocaleString(),
        "-------------------------------",
        "Windows accepted this test print.",
        "Check the printer queue and paper.",
      ].join("\n"),
    },
  });
}

function receiptCurrency(value: string | undefined) {
  return value && /^[A-Z]{3}$/.test(value) ? value : "JMD";
}

function formatReceiptAmount(value: number, currency: string) {
  return formatCurrency(value, currency);
}

function wrapReceiptLine(line: string, width: number) {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const wrapped: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current) wrapped.push(current);
      for (let offset = 0; offset < word.length; offset += width) {
        wrapped.push(word.slice(offset, offset + width));
      }
      current = "";
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      wrapped.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) wrapped.push(current);
  return wrapped;
}

function wrapReceiptText(value: string, width: number) {
  return value.split(/\r?\n/).flatMap((line) => wrapReceiptLine(line, width));
}

export function buildNativeReceiptText(payload: NativePrintPayload) {
  const currency = receiptCurrency(payload.currency);
  const width = payload.paperWidthMm === 80 ? 46 : 32;
  const detailed = payload.itemLayout !== "compact";
  const items = payload.items ?? [];
  const total = typeof payload.totalAmount === "number" && Number.isFinite(payload.totalAmount)
    ? payload.totalAmount
    : items.reduce((sum, item) => sum + (item.totalPrice ?? (item.unitPrice ?? 0) * (item.quantity ?? 1)), 0);
  const lines = [
    ...(payload.businessName?.trim() ? wrapReceiptLine(payload.businessName.trim(), width) : ["Store"]),
    ...(payload.businessPhone ? wrapReceiptLine(payload.businessPhone.trim(), width) : []),
    ...(payload.address ? wrapReceiptText(payload.address.trim(), width) : []),
    "",
    ...(payload.receiptNumber ? [`Receipt: ${payload.receiptNumber}`] : []),
    ...(payload.createdAt && Number.isFinite(Date.parse(payload.createdAt))
      ? [new Date(payload.createdAt).toLocaleString()]
      : []),
    "",
  ];

  for (const item of items) {
    const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 1;
    const itemName = item.name?.trim() || "Item";
    lines.push(...wrapReceiptLine(`${quantity} x ${itemName}`, width));
    if (payload.showSku && item.sku?.trim()) {
      lines.push(...wrapReceiptLine(`SKU ${item.sku.trim()}`, width));
    }
    if (detailed && item.unitPrice != null && Number.isFinite(item.unitPrice)) {
      lines.push(...wrapReceiptLine(`  ${formatReceiptAmount(item.unitPrice, currency)} each`, width));
    }
    if (item.totalPrice != null && Number.isFinite(item.totalPrice)) {
      lines.push(...wrapReceiptLine(`  Item total: ${formatReceiptAmount(item.totalPrice, currency)}`, width));
    } else if (!detailed) {
      lines.push(...wrapReceiptLine(`  Item total: ${formatReceiptAmount((item.unitPrice ?? 0) * quantity, currency)}`, width));
    }
    if (item.warehouseLocation) {
      lines.push(...wrapReceiptLine(`  ${item.warehouseLocation}`, width));
    }
    lines.push("");
  }

  lines.push(
    "-".repeat(width),
    "TOTAL",
    formatReceiptAmount(total, currency),
  );
  if (payload.receiptFooter?.trim()) {
    lines.push("", ...wrapReceiptText(payload.receiptFooter.trim(), width));
  }
  return lines.join("\n");
}

export async function dispatchPrintJob(job: PrintJob) {
  const invoke = tauri()?.core?.invoke;
  if (!invoke) return false;
  let printerName = "the selected printer";
  let submittedToWindows = false;
  try {
    if (!job.printerId) throw new Error("No receipt printer is selected. Choose one in Settings → Printers.");
    const payload = JSON.parse(job.payload) as NativePrintPayload;
    if (!payload.printerName?.trim()) {
      throw new Error("This print job has no Windows device name. Check the selected printer in Settings → Printers.");
    }
    printerName = payload.printerName;

    const isCustomerReceipt = job.documentType === "customer_receipt";
    const lines = isCustomerReceipt
      ? buildNativeReceiptText(payload)
      : [
          payload.businessName?.trim() || "STORE",
          payload.receiptNumber ? `Receipt: ${payload.receiptNumber}` : job.documentType.replaceAll("_", " ").toUpperCase(),
          "",
          ...(payload.items ?? []).flatMap((item) => [
            `${item.quantity ?? 1} x ${item.name ?? "Item"}`,
            ...(item.warehouseLocation ? [`  ${item.warehouseLocation}`] : []),
          ]),
        ].join("\n");

    await updatePrintJobStatus(job.id, { status: "printing" });
    await invoke("print_native_document", {
      request: { printer_name: printerName, content: lines },
    });
    submittedToWindows = true;
    await updatePrintJobStatus(job.id, { status: "printed" });
    return true;
  } catch (error) {
    const message = nativePrinterErrorMessage(error, "Windows could not submit the receipt.");
    if (submittedToWindows) {
      throw new Error(`${printerName}: Windows accepted the job, but Violet could not save its status. Check the Windows queue and paper before trying again.`);
    }
    try {
      await updatePrintJobStatus(job.id, { status: "failed", errorMessage: message });
    } catch {
      throw new Error(`${message} The print history could not be updated; check the Windows print queue before retrying.`);
    }
    throw new Error(`${printerName}: ${message}`);
  }
}

export async function dispatchSalePrintJobs(jobs: PrintJob[] | undefined) {
  if (!jobs?.length || !isDesktopPrinterAvailable()) return [];
  const results = await Promise.allSettled(jobs.filter((job) => job.status === "queued").map(dispatchPrintJob));
  return results.flatMap((result) => result.status === "rejected"
    ? [nativePrinterErrorMessage(result.reason, "Windows could not submit a print job.")]
    : []);
}