import React, { useMemo, useState } from "react";
import {
  exportReportingTransactions,
  getGetAuditReportQueryKey,
  getGetCashReportQueryKey,
  getGetInventoryReportQueryKey,
  getGetInventoryMovementReportQueryKey,
  getGetEmployeeReportQueryKey,
  getGetProductReportQueryKey,
  getGetPurchasingReportQueryKey,
  getGetReportDefinitionsQueryKey,
  getGetReportTransactionsQueryKey,
  getGetReportingSummaryQueryKey,
  getGetSalesReportQueryKey,
  getGetStoreReportQueryKey,
  getListEmployeesQueryKey,
  getListRegistersQueryKey,
  getListStoresQueryKey,
  useGetAuditReport,
  useGetCashReport,
  useGetInventoryReport,
  useGetInventoryMovementReport,
  useGetEmployeeReport,
  useGetProductReport,
  useGetPurchasingReport,
  useGetReportDefinitions,
  useGetReportTransactions,
  useGetReportingSummary,
  useGetSalesReport,
  useGetStoreReport,
  useListStores,
  useListEmployees,
  useListRegisters,
} from "@workspace/api-client-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { subDays, format } from "date-fns";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  BookOpen,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileBarChart,
  FileClock,
  Filter,
  Landmark,
  PackageSearch,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type AnyRecord = Record<string, any>;
type TabKey = "overview" | "sales" | "products" | "inventory" | "profit" | "cash" | "employees" | "purchasing" | "stores" | "audit";

const tabs: Array<{ value: TabKey; label: string; icon: React.ElementType }> = [
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "sales", label: "Sales", icon: Activity },
  { value: "products", label: "Products", icon: PackageSearch },
  { value: "inventory", label: "Inventory", icon: Boxes },
  { value: "profit", label: "Profit", icon: CircleDollarSign },
  { value: "cash", label: "Cash management", icon: Banknote },
  { value: "employees", label: "Employees", icon: Users },
  { value: "purchasing", label: "Purchasing", icon: ShoppingBag },
  { value: "stores", label: "Stores", icon: Store },
  { value: "audit", label: "Audit", icon: FileClock },
];

const chartColors = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

function money(value: unknown) {
  return formatCurrency(Number(value ?? 0));
}

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString();
}

function MetricCard({ label, value, detail, icon: Icon, tone = "default" }: { label: string; value: string; detail?: string; icon: React.ElementType; tone?: "default" | "positive" | "warning" }) {
  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className={`mt-2 text-2xl font-bold tracking-tight ${tone === "positive" ? "text-emerald-600 dark:text-emerald-400" : tone === "warning" ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</p>
            {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
          </div>
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingBlock({ className = "h-32" }: { className?: string }) {
  return <Skeleton className={`w-full ${className}`} />;
}

function EmptyState({ title, description, icon: Icon = Archive }: { title: string; description: string; icon?: React.ElementType }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
      <Icon className="mb-3 h-8 w-8 text-muted-foreground/60" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 text-center">
      <AlertTriangle className="mb-2 h-6 w-6 text-destructive" />
      <p className="font-medium">Report data could not be loaded</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
    </div>
  );
}

function ReportTable({ columns, rows, emptyTitle = "No records found" }: { columns: Array<{ key: string; label: string; align?: "right" }>; rows: AnyRecord[]; emptyTitle?: string }) {
  if (!rows.length) return <EmptyState title={emptyTitle} description="Try widening the date range or clearing a filter." />;
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader><TableRow>{columns.map((column) => <TableHead key={column.key} className={column.align === "right" ? "text-right" : ""}>{column.label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((row, index) => <TableRow key={String(row.id ?? row.productId ?? row.storeId ?? row.receiptNumber ?? index)}>
          {columns.map((column) => <TableCell key={column.key} className={column.align === "right" ? "text-right" : ""}>{row[column.key] ?? "—"}</TableCell>)}
        </TableRow>)}</TableBody>
      </Table>
    </div>
  );
}

function ReportToolbar({ datePreset, setDatePreset, setCustomStart, setCustomEnd, customStart, customEnd, storeId, setStoreId, registerId, setRegisterId, cashierId, setCashierId, paymentMethod, setPaymentMethod, stores, registers, employees, onExport, onPrint }: AnyRecord) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
      <div className="flex items-center gap-2 text-sm font-medium"><Filter className="h-4 w-4 text-primary" />Filters</div>
      <Select value={datePreset} onValueChange={setDatePreset}>
        <SelectTrigger className="w-full lg:w-44"><CalendarDays className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem><SelectItem value="365">Last 12 months</SelectItem><SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      {datePreset === "custom" && <div className="flex items-center gap-2"><Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="w-auto" /><span className="text-muted-foreground">to</span><Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="w-auto" /></div>}
      <Select value={storeId} onValueChange={setStoreId}>
        <SelectTrigger className="w-full lg:w-48"><Store className="mr-2 h-4 w-4" /><SelectValue placeholder="All stores" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All stores</SelectItem>{(stores ?? []).map((store: AnyRecord) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={registerId} onValueChange={setRegisterId}>
        <SelectTrigger className="w-full lg:w-44"><Landmark className="mr-2 h-4 w-4" /><SelectValue placeholder="All registers" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All registers</SelectItem>{(registers ?? []).map((register: AnyRecord) => <SelectItem key={register.id} value={register.id}>{register.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={cashierId} onValueChange={setCashierId}>
        <SelectTrigger className="w-full lg:w-44"><Users className="mr-2 h-4 w-4" /><SelectValue placeholder="All cashiers" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All cashiers</SelectItem>{(employees ?? []).map((employee: AnyRecord) => <SelectItem key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
        <SelectTrigger className="w-full lg:w-44"><Banknote className="mr-2 h-4 w-4" /><SelectValue placeholder="All payments" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All payments</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="bank_transfer">Bank transfer</SelectItem><SelectItem value="mixed">Mixed</SelectItem></SelectContent>
      </Select>
      <div className="ml-auto flex flex-wrap gap-2">
        {(["csv", "xlsx", "pdf"] as const).map((formatName) => <Button key={formatName} size="sm" variant="outline" onClick={() => onExport(formatName)}><Download className="mr-1.5 h-3.5 w-3.5" />{formatName.toUpperCase()}</Button>)}
        <Button size="sm" variant="outline" onClick={onPrint}><Printer className="mr-1.5 h-3.5 w-3.5" />Print</Button>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [datePreset, setDatePreset] = useState("30");
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [storeId, setStoreId] = useState("all");
  const [registerId, setRegisterId] = useState("all");
  const [cashierId, setCashierId] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const range = useMemo(() => {
    const end = datePreset === "custom" ? new Date(`${customEnd}T23:59:59`) : new Date();
    const start = datePreset === "custom" ? new Date(`${customStart}T00:00:00`) : subDays(end, Number(datePreset));
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [datePreset, customStart, customEnd]);
  const scoped = {
    ...(storeId === "all" ? {} : { storeId }),
    ...(registerId === "all" ? {} : { registerId }),
    ...(cashierId === "all" ? {} : { cashierId }),
    ...(paymentMethod === "all" ? {} : { paymentMethod }),
  };
  const params = { ...range, ...scoped };
  const enabled = (tab: TabKey | TabKey[]) => (Array.isArray(tab) ? tab.includes(activeTab) : activeTab === tab);

  const storesQuery = useListStores({ query: { queryKey: getListStoresQueryKey() } });
  const registersQuery = useListRegisters(storeId === "all" ? undefined : { storeId }, { query: { queryKey: getListRegistersQueryKey(storeId === "all" ? undefined : { storeId }), enabled: storeId !== "all" } });
  const employeesQuery = useListEmployees({ query: { queryKey: getListEmployeesQueryKey() } });
  const definitionsQuery = useGetReportDefinitions({ query: { queryKey: getGetReportDefinitionsQueryKey() } });
  const summaryQuery = useGetReportingSummary(params, { query: { queryKey: getGetReportingSummaryQueryKey(params), enabled: enabled(["overview", "sales", "profit"]) } });
  const legacySalesParams = { ...range, groupBy: datePreset === "365" ? "month" as const : "day" as const };
  const legacySalesQuery = useGetSalesReport(legacySalesParams, { query: { queryKey: getGetSalesReportQueryKey(legacySalesParams), enabled: enabled("overview") } });
  const inventoryQuery = useGetInventoryReport({ query: { queryKey: getGetInventoryReportQueryKey(), enabled: enabled(["overview", "inventory"]) } });
  const movementQuery = useGetInventoryMovementReport(range, { query: { queryKey: getGetInventoryMovementReportQueryKey(range), enabled: enabled("inventory") } });
  const employeeQuery = useGetEmployeeReport(params, { query: { queryKey: getGetEmployeeReportQueryKey(params), enabled: enabled("employees") } });
  const transactionParams = { ...params, page, limit: 25 };
  const transactionsQuery = useGetReportTransactions(transactionParams, { query: { queryKey: getGetReportTransactionsQueryKey(transactionParams), enabled: enabled(["sales", "employees"]) } });
  const productsQuery = useGetProductReport(params, { query: { queryKey: getGetProductReportQueryKey(params), enabled: enabled(["products", "profit"]) } });
  const cashQuery = useGetCashReport(params, { query: { queryKey: getGetCashReportQueryKey(params), enabled: enabled("cash") } });
  const purchasingQuery = useGetPurchasingReport({ query: { queryKey: getGetPurchasingReportQueryKey(), enabled: enabled("purchasing") } });
  const storeQuery = useGetStoreReport(range, { query: { queryKey: getGetStoreReportQueryKey(range), enabled: enabled("stores") } });
  const auditQuery = useGetAuditReport({ query: { queryKey: getGetAuditReportQueryKey(), enabled: enabled("audit") } });

  const summary = (summaryQuery.data ?? {}) as AnyRecord;
  const inventory = (inventoryQuery.data ?? {}) as AnyRecord;
  const products = ((productsQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];
  const transactions = ((transactionsQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];
  const cashRows = ((cashQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];
  const purchaseRows = ((purchasingQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];
  const storeRows = ((storeQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];
  const auditRows = ((auditQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];
  const movementRows = ((movementQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];
  const employeeRows = ((employeeQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];
  const trend = (summary.data ?? legacySalesQuery.data?.data ?? []) as AnyRecord[];
  const isLoading = summaryQuery.isLoading || inventoryQuery.isLoading;
  const reportStores = (Array.isArray(storesQuery.data) ? storesQuery.data : (storesQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];
  const reportRegisters = (Array.isArray(registersQuery.data) ? registersQuery.data : (registersQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];
  const reportEmployees = (Array.isArray(employeesQuery.data) ? employeesQuery.data : (employeesQuery.data as AnyRecord | undefined)?.data ?? []) as AnyRecord[];

  const handleExport = async (formatName: "csv" | "xlsx" | "pdf") => {
    try {
      const blob = await exportReportingTransactions({ format: formatName, ...params });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `violet-${activeTab}-report.${formatName}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // The report remains visible; browser error boundaries handle network failures.
    }
  };

  const retryActive = () => {
    void Promise.all([summaryQuery.refetch(), inventoryQuery.refetch(), movementQuery.refetch(), employeeQuery.refetch(), transactionsQuery.refetch(), productsQuery.refetch(), cashQuery.refetch(), purchasingQuery.refetch(), storeQuery.refetch(), auditQuery.refetch()]);
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><FileBarChart className="h-4 w-4" />Management intelligence</div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Reports & Analytics</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">Understand what is selling, what is profitable, and where your operation needs attention.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" />Live from your operational records</div>
      </div>

      <ReportToolbar {...{ ...range, datePreset, setDatePreset, setCustomStart, setCustomEnd, customStart, customEnd, storeId, setStoreId, registerId, setRegisterId, cashierId, setCashierId, paymentMethod, setPaymentMethod, stores: reportStores, registers: reportRegisters, employees: reportEmployees, onExport: handleExport, onPrint: () => window.print() }} />

      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as TabKey); setPage(1); }}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/70 p-1">
          {tabs.map(({ value, label, icon: Icon }) => <TabsTrigger key={value} value={value} className="gap-2 py-2.5"><Icon className="h-4 w-4" />{label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Net sales" value={money(summary.netSales)} detail={`${number(summary.transactions)} completed transactions`} icon={CircleDollarSign} tone="positive" />
            <MetricCard label="Average sale" value={money(summary.averageSale)} detail="After recorded discounts" icon={ArrowUpRight} />
            <MetricCard label="Gross profit" value={money(summary.grossProfit)} detail={`${Number(summary.grossMargin ?? 0).toFixed(1)}% margin`} icon={BarChart3} tone="positive" />
            <MetricCard label="Refunds" value={money(summary.refunds)} detail="Completed merchandise refunds" icon={ArrowDownRight} />
            <MetricCard label="Stock alerts" value={number(Number(inventory.lowStockCount ?? 0) + Number(inventory.outOfStockCount ?? 0))} detail={`${number(inventory.outOfStockCount)} out of stock`} icon={AlertTriangle} tone="warning" />
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Card><CardHeader><CardTitle>Sales trend</CardTitle><CardDescription>Net operational activity across the selected range</CardDescription></CardHeader><CardContent>
              {isLoading ? <LoadingBlock className="h-72" /> : trend.length ? <ResponsiveContainer width="100%" height={290}><LineChart data={trend}><CartesianGrid vertical={false} strokeDasharray="4 4" /><XAxis dataKey="date" tickFormatter={(value) => format(new Date(value), "MMM d")} /><YAxis tickFormatter={(value) => `$${value}`} /><Tooltip formatter={(value: number) => [money(value), "Sales"]} /><Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer> : <EmptyState title="No sales in this range" description="Completed transactions will appear here once your team starts trading." />}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Payment mix</CardTitle><CardDescription>Captured tender totals, separate from net sales</CardDescription></CardHeader><CardContent>
              {isLoading ? <LoadingBlock className="h-72" /> : summary.paymentTotals?.length ? <div className="space-y-5"><ResponsiveContainer width="100%" height={190}><PieChart><Pie data={summary.paymentTotals} dataKey="amount" nameKey="method" innerRadius={55} outerRadius={82} paddingAngle={3}>{summary.paymentTotals.map((_: AnyRecord, index: number) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value: number) => money(value)} /></PieChart></ResponsiveContainer><div className="grid grid-cols-2 gap-3">{summary.paymentTotals.map((item: AnyRecord, index: number) => <div key={item.method} className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /> <span className="capitalize text-muted-foreground">{String(item.method).replace("_", " ")}</span><strong className="ml-auto">{money(item.amount)}</strong></div>)}</div></div> : <EmptyState title="No payment data" description="Payment totals appear after completed sales." />}
            </CardContent></Card>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card><CardHeader><CardTitle>Inventory health</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex justify-between"><span className="text-muted-foreground">Inventory value</span><strong>{money(inventory.totalValue)}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Active products</span><strong>{number(inventory.totalProducts)}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">Low stock</span><Badge variant="warning">{number(inventory.lowStockCount)}</Badge></div></CardContent></Card>
            <Card className="lg:col-span-2"><CardHeader><CardTitle>Management notes</CardTitle><CardDescription>Data quality signals to keep reporting trustworthy</CardDescription></CardHeader><CardContent className="space-y-3">{summary.legacy?.missingCostLines ? <div className="flex gap-3 rounded-lg bg-amber-500/10 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" /><span>{number(summary.legacy.missingCostLines)} legacy sale lines have no historical cost snapshot, so COGS and profit exclude them.</span></div> : <div className="flex gap-3 rounded-lg bg-emerald-500/10 p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /><span>All reported sale lines have historical cost data available for profit calculations.</span></div>}<div className="flex gap-3 rounded-lg bg-muted p-3 text-sm"><BookOpen className="mt-0.5 h-4 w-4 text-muted-foreground" /><span>Legacy records without store, register, or shift attribution remain labeled as unknown rather than being guessed.</span></div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="sales" className="space-y-5">
          <SectionHeader title="Sales performance" description="Transactions, timing, tender, and operator drill-down for the selected range" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Gross sales" value={money(summary.grossSales)} icon={CircleDollarSign} /><MetricCard label="Net sales" value={money(summary.netSales)} icon={ArrowUpRight} tone="positive" /><MetricCard label="Transactions" value={number(summary.transactions)} icon={ClipboardList} /><MetricCard label="Discounts" value={money(summary.discounts)} icon={ArrowDownRight} /></div>
          <Card><CardHeader><CardTitle>Transaction detail</CardTitle><CardDescription>Click a receipt to inspect the underlying sale in the operational sales workspace.</CardDescription></CardHeader><CardContent><ReportTable columns={[{ key: "receiptNumber", label: "Receipt" }, { key: "createdAt", label: "Date" }, { key: "status", label: "Status" }, { key: "paymentMethod", label: "Tender" }, { key: "totalAmount", label: "Total", align: "right" }]} rows={transactions.map((row) => ({ ...row, createdAt: row.createdAt ? formatDateTime(row.createdAt) : "—", totalAmount: money(row.totalAmount), paymentMethod: String(row.paymentMethod ?? "").replace("_", " ") }))} /><div className="mt-4 flex items-center justify-between text-sm text-muted-foreground"><span>{number((transactionsQuery.data as AnyRecord | undefined)?.total)} total matching transactions</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={transactions.length < 25} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></CardContent></Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-5"><SectionHeader title="Product performance" description="Best sellers, contribution, and margin by product" /><Card><CardHeader><CardTitle>Product profitability</CardTitle><CardDescription>Sorted by net sales; historical line cost is used for COGS.</CardDescription></CardHeader><CardContent><ReportTable columns={[{ key: "productName", label: "Product" }, { key: "units", label: "Units", align: "right" }, { key: "netSales", label: "Net sales", align: "right" }, { key: "cogs", label: "COGS", align: "right" }, { key: "grossProfit", label: "Gross profit", align: "right" }]} rows={products.map((row) => ({ ...row, units: number(row.units), netSales: money(row.netSales), cogs: money(row.cogs), grossProfit: money(row.grossProfit) }))} /></CardContent></Card></TabsContent>

        <TabsContent value="inventory" className="space-y-5"><SectionHeader title="Inventory control" description="Current stock, valuation, and replenishment signals" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Inventory value" value={money(inventory.totalValue)} icon={Landmark} /><MetricCard label="Products" value={number(inventory.totalProducts)} icon={Boxes} /><MetricCard label="Low stock" value={number(inventory.lowStockCount)} icon={AlertTriangle} tone="warning" /><MetricCard label="Out of stock" value={number(inventory.outOfStockCount)} icon={PackageSearch} tone="warning" /></div><Card><CardHeader><CardTitle>Stock valuation</CardTitle><CardDescription>Current inventory value uses the product's recorded cost price.</CardDescription></CardHeader><CardContent><ReportTable columns={[{ key: "name", label: "Product" }, { key: "sku", label: "SKU" }, { key: "stock", label: "On hand", align: "right" }, { key: "minStock", label: "Minimum", align: "right" }, { key: "valuation", label: "Value", align: "right" }]} rows={((inventory.data ?? []) as AnyRecord[]).map((row) => ({ ...row, valuation: money(row.valuation), stock: number(row.stock), minStock: number(row.minStock) }))} emptyTitle="No inventory records" /></CardContent></Card><Card><CardHeader><CardTitle>Movement trail</CardTitle><CardDescription>Adjustments, purchases, sales, and corrections in the selected period.</CardDescription></CardHeader><CardContent><ReportTable columns={[{ key: "createdAt", label: "When" }, { key: "productName", label: "Product" }, { key: "reason", label: "Reason" }, { key: "adjustment", label: "Change", align: "right" }, { key: "note", label: "Note" }]} rows={movementRows.map((row) => ({ ...row, createdAt: row.createdAt ? formatDateTime(row.createdAt) : "—", adjustment: Number(row.adjustment) > 0 ? `+${row.adjustment}` : String(row.adjustment), reason: String(row.reason ?? "").replace("_", " ") }))} emptyTitle="No movements in this period" /></CardContent></Card></TabsContent>

        <TabsContent value="profit" className="space-y-5"><SectionHeader title="Profit & margin" description="A transparent view of net sales, historical cost, and contribution" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Net sales" value={money(summary.netSales)} icon={ArrowUpRight} tone="positive" /><MetricCard label="COGS" value={money(summary.cogs)} icon={Archive} /><MetricCard label="Gross profit" value={money(summary.grossProfit)} icon={CircleDollarSign} tone="positive" /><MetricCard label="Gross margin" value={`${Number(summary.grossMargin ?? 0).toFixed(1)}%`} icon={BarChart3} /></div><Card><CardHeader><CardTitle>Contribution by product</CardTitle><CardDescription>Use the export controls above for the filtered result.</CardDescription></CardHeader><CardContent><ReportTable columns={[{ key: "productName", label: "Product" }, { key: "units", label: "Units", align: "right" }, { key: "grossProfit", label: "Profit", align: "right" }]} rows={products.map((row) => ({ ...row, units: number(row.units), grossProfit: money(row.grossProfit) }))} /></CardContent></Card></TabsContent>

        <TabsContent value="cash" className="space-y-5"><SectionHeader title="Cash management" description="Register events and cash movement for accountability at close" /><Card><CardHeader><CardTitle>Cash events</CardTitle><CardDescription>Drops and payouts recorded against register shifts.</CardDescription></CardHeader><CardContent><ReportTable columns={[{ key: "type", label: "Event" }, { key: "count", label: "Events", align: "right" }, { key: "amount", label: "Amount", align: "right" }]} rows={cashRows.map((row) => ({ ...row, type: String(row.type).replace("_", " "), count: number(row.count), amount: money(row.amount) }))} emptyTitle="No cash events" /></CardContent></Card></TabsContent>

        <TabsContent value="employees" className="space-y-5"><SectionHeader title="Employee performance" description="Cashier attribution and transaction activity from recorded sales" /><Card><CardHeader><CardTitle>Cashier performance</CardTitle><CardDescription>Completed sales grouped by the employee who recorded them.</CardDescription></CardHeader><CardContent><ReportTable columns={[{ key: "employee", label: "Employee" }, { key: "role", label: "Role" }, { key: "transactions", label: "Transactions", align: "right" }, { key: "sales", label: "Sales", align: "right" }, { key: "discounts", label: "Discounts", align: "right" }]} rows={employeeRows.map((row) => ({ ...row, employee: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "Unknown employee", transactions: number(row.transactions), sales: money(row.sales), discounts: money(row.discounts), role: String(row.role ?? "").replace("_", " ") }))} emptyTitle="No employee activity" /></CardContent></Card></TabsContent>

        <TabsContent value="purchasing" className="space-y-5"><SectionHeader title="Purchasing & receiving" description="Supplier commitments, received costs, and discrepancies from purchase orders" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><MetricCard label="Purchase spend" value={money((purchasingQuery.data as AnyRecord | undefined)?.totalSpend)} icon={ShoppingBag} /><MetricCard label="Orders" value={number(purchaseRows.length)} icon={ClipboardList} /><MetricCard label="Receiving status" value={number(purchaseRows.filter((row) => row.status === "received").length)} detail="Orders fully received" icon={CheckCircle2} tone="positive" /></div><Card><CardHeader><CardTitle>Purchase orders</CardTitle><CardDescription>Actual supplier records, not estimates.</CardDescription></CardHeader><CardContent><ReportTable columns={[{ key: "orderNumber", label: "Order" }, { key: "status", label: "Status" }, { key: "supplierId", label: "Supplier" }, { key: "createdAt", label: "Created" }, { key: "totalAmount", label: "Total", align: "right" }]} rows={purchaseRows.map((row) => ({ ...row, createdAt: row.createdAt ? formatDateTime(row.createdAt) : "—", totalAmount: money(row.totalAmount) }))} /></CardContent></Card></TabsContent>

        <TabsContent value="stores" className="space-y-5"><SectionHeader title="Stores & registers" description="Compare performance across the operating hierarchy" /><Card><CardHeader><CardTitle>Store comparison</CardTitle><CardDescription>Legacy transactions remain visible as Unknown until attribution is recorded.</CardDescription></CardHeader><CardContent><ReportTable columns={[{ key: "storeName", label: "Store" }, { key: "transactions", label: "Transactions", align: "right" }, { key: "sales", label: "Sales", align: "right" }]} rows={storeRows.map((row) => ({ ...row, transactions: number(row.transactions), sales: money(row.sales) }))} emptyTitle="No store activity" /></CardContent></Card></TabsContent>

        <TabsContent value="audit" className="space-y-5"><SectionHeader title="Audit history" description="Searchable, tenant-scoped management events for accountability" /><div className="flex max-w-md items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><Input placeholder="Filter visible events..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><Card><CardHeader><CardTitle>Activity trail</CardTitle><CardDescription>Management actions include the actor, entity, and timestamp.</CardDescription></CardHeader><CardContent><ReportTable columns={[{ key: "action", label: "Action" }, { key: "entityType", label: "Entity" }, { key: "summary", label: "Summary" }, { key: "createdAt", label: "When" }]} rows={auditRows.filter((row) => !search || JSON.stringify(row).toLowerCase().includes(search.toLowerCase())).map((row) => ({ ...row, createdAt: row.createdAt ? formatDateTime(row.createdAt) : "—" }))} emptyTitle="No audit events" /></CardContent></Card></TabsContent>
      </Tabs>
      {definitionsQuery.data && <p className="text-xs text-muted-foreground">Reporting definitions are maintained centrally so gross sales, net sales, COGS, and margin stay consistent across every view.</p>}
      {(summaryQuery.isError || inventoryQuery.isError || movementQuery.isError || employeeQuery.isError || transactionsQuery.isError || productsQuery.isError || cashQuery.isError || purchasingQuery.isError || storeQuery.isError || auditQuery.isError) && <ErrorState onRetry={retryActive} />}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mt-1 text-muted-foreground">{description}</p></div>;
}