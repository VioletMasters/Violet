import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ReportsProvider, useReportsContext } from "./context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getListRegistersQueryKey, useListStores, useListRegisters, useListEmployees } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Printer, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";

const TABS = [
  { id: "overview", label: "Overview", path: "/reports/overview" },
  { id: "sales", label: "Sales & Tax", path: "/reports/sales" },
  { id: "products", label: "Products", path: "/reports/products" },
  { id: "inventory", label: "Inventory", path: "/reports/inventory" },
  { id: "cash", label: "Cash Management", path: "/reports/cash" },
  { id: "purchasing", label: "Purchasing", path: "/reports/purchasing" },
  { id: "stores", label: "Stores", path: "/reports/stores" },
  { id: "audit", label: "Audit Log", path: "/reports/audit" },
];

function ReportFilters() {
  const { 
    datePreset, setDatePreset, 
    startDate, endDate, setCustomDateRange,
    storeId, setStoreId,
    registerId, setRegisterId,
    cashierId, setCashierId
  } = useReportsContext();

  const { data: storesResponse } = useListStores();
  const registerParams = storeId ? { storeId } : undefined;
  const { data: registersResponse } = useListRegisters(registerParams, { query: { queryKey: getListRegistersQueryKey(registerParams), enabled: !!storeId } });
  const { data: employeesResponse } = useListEmployees();

  const stores = (Array.isArray(storesResponse) ? storesResponse : (storesResponse as any)?.data || []) as any[];
  const registers = (Array.isArray(registersResponse) ? registersResponse : (registersResponse as any)?.data || []) as any[];
  const employees = (Array.isArray(employeesResponse) ? employeesResponse : (employeesResponse as any)?.data || []) as any[];

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 bg-card border rounded-lg p-2 shadow-sm">
      <div className="flex items-center gap-1 pr-2 border-r">
        <Filter className="w-4 h-4 text-muted-foreground ml-2 mr-1" />
        <span className="text-sm font-medium text-muted-foreground">Filters</span>
      </div>

      <div className="flex items-center gap-2 px-2 border-r">
        <Select value={datePreset} onValueChange={(v: any) => setDatePreset(v)}>
          <SelectTrigger className="w-[140px] h-8 text-xs bg-transparent border-none shadow-none focus:ring-0">
            <Calendar className="w-3.5 h-3.5 mr-2 opacity-70" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="thisMonth">This Month</SelectItem>
            <SelectItem value="lastMonth">Last Month</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        {datePreset === "custom" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs font-normal">
                {format(parseISO(startDate), "MMM d, yyyy")} - {format(parseISO(endDate), "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex">
                <CalendarComponent
                  mode="single"
                  selected={parseISO(startDate)}
                  onSelect={(d) => d && setCustomDateRange(d.toISOString(), endDate)}
                  initialFocus
                />
                <CalendarComponent
                  mode="single"
                  selected={parseISO(endDate)}
                  onSelect={(d) => d && setCustomDateRange(startDate, d.toISOString())}
                  initialFocus
                />
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="flex items-center gap-2 px-2 border-r">
        <Select value={storeId || "all"} onValueChange={(v) => { setStoreId(v === "all" ? "" : v); setRegisterId(""); }}>
          <SelectTrigger className="w-[140px] h-8 text-xs bg-transparent border-none shadow-none focus:ring-0">
            <SelectValue placeholder="All Stores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stores</SelectItem>
            {stores.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={registerId || "all"} onValueChange={(v) => setRegisterId(v === "all" ? "" : v)} disabled={!storeId}>
          <SelectTrigger className="w-[140px] h-8 text-xs bg-transparent border-none shadow-none focus:ring-0">
            <SelectValue placeholder="All Registers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Registers</SelectItem>
            {registers.map(r => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={cashierId || "all"} onValueChange={(v) => setCashierId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px] h-8 text-xs bg-transparent border-none shadow-none focus:ring-0">
            <SelectValue placeholder="All Cashiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cashiers</SelectItem>
            {employees.map(e => (
              <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1 pr-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Printer className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ReportsInner({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">Financial, operational, and audit insights</p>
        </div>

        <nav className="flex space-x-1 border-b border-border/50 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const isActive = location.startsWith(tab.path);
            return (
              <Link key={tab.id} href={tab.path}>
                <div
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors hover:text-primary cursor-pointer",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:border-muted-foreground/30"
                  )}
                >
                  {tab.label}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <ReportFilters />

      <div className="min-h-[500px]">
        {children}
      </div>
    </div>
  );
}

export function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ReportsProvider>
      <ReportsInner>{children}</ReportsInner>
    </ReportsProvider>
  );
}
