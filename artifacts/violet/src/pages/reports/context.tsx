import React, { createContext, useContext, useState, useMemo } from "react";
import { subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns";

export type DatePreset = "today" | "yesterday" | "7days" | "30days" | "thisMonth" | "lastMonth" | "custom";

interface ReportsContextType {
  datePreset: DatePreset;
  setDatePreset: (preset: DatePreset) => void;
  startDate: string;
  endDate: string;
  setCustomDateRange: (start: string, end: string) => void;
  storeId: string;
  setStoreId: (id: string) => void;
  registerId: string;
  setRegisterId: (id: string) => void;
  cashierId: string;
  setCashierId: (id: string) => void;
}

const ReportsContext = createContext<ReportsContextType | null>(null);

export function useReportsContext() {
  const ctx = useContext(ReportsContext);
  if (!ctx) throw new Error("useReportsContext must be used within ReportsProvider");
  return ctx;
}

export function ReportsProvider({ children }: { children: React.ReactNode }) {
  const [datePreset, setDatePreset] = useState<DatePreset>("30days");
  const [customStart, setCustomStart] = useState<string>(subDays(new Date(), 30).toISOString());
  const [customEnd, setCustomEnd] = useState<string>(new Date().toISOString());
  
  const [storeId, setStoreId] = useState<string>("");
  const [registerId, setRegisterId] = useState<string>("");
  const [cashierId, setCashierId] = useState<string>("");

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (datePreset) {
      case "today":
        return { startDate: startOfDay(now).toISOString(), endDate: endOfDay(now).toISOString() };
      case "yesterday": {
        const y = subDays(now, 1);
        return { startDate: startOfDay(y).toISOString(), endDate: endOfDay(y).toISOString() };
      }
      case "7days":
        return { startDate: startOfDay(subDays(now, 7)).toISOString(), endDate: endOfDay(now).toISOString() };
      case "30days":
        return { startDate: startOfDay(subDays(now, 30)).toISOString(), endDate: endOfDay(now).toISOString() };
      case "thisMonth":
        return { startDate: startOfMonth(now).toISOString(), endDate: endOfDay(now).toISOString() };
      case "lastMonth": {
        const lm = subMonths(now, 1);
        return { startDate: startOfMonth(lm).toISOString(), endDate: endOfMonth(lm).toISOString() };
      }
      case "custom":
        return { startDate: customStart, endDate: customEnd };
      default:
        return { startDate: startOfDay(subDays(now, 30)).toISOString(), endDate: endOfDay(now).toISOString() };
    }
  }, [datePreset, customStart, customEnd]);

  const setCustomDateRange = (start: string, end: string) => {
    setDatePreset("custom");
    setCustomStart(start);
    setCustomEnd(end);
  };

  return (
    <ReportsContext.Provider value={{
      datePreset, setDatePreset,
      startDate, endDate, setCustomDateRange,
      storeId, setStoreId,
      registerId, setRegisterId,
      cashierId, setCashierId
    }}>
      {children}
    </ReportsContext.Provider>
  );
}
