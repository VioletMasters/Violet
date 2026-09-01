import React, { useState } from "react";
import { useReportsContext } from "./context";
import { useListAuditEvents } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Activity, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ReportsAudit() {
  const { startDate, endDate } = useReportsContext();
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data: response, isLoading } = useListAuditEvents({
    startDate,
    endDate,
    page,
    limit
  });

  const events = (response as any)?.data || [];
  const total = (response as any)?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex justify-between items-center bg-card p-3 rounded-lg border shadow-sm">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search audit log..." 
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="text-sm text-muted-foreground font-medium">
          {total} Events
        </div>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium w-48">Date & Time</th>
                <th className="px-4 py-3 font-medium w-32">Actor</th>
                <th className="px-4 py-3 font-medium w-32">Action</th>
                <th className="px-4 py-3 font-medium w-32">Entity</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-24" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-full max-w-md" /></td>
                  </tr>
                ))
              ) : events.length > 0 ? (
                events.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono text-xs">
                      {format(parseISO(e.createdAt), "MMM d, yyyy h:mm:ss a")}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {e.actorName || 'System'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono bg-background">
                        {e.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs uppercase tracking-wider">
                      {e.entityType}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="text-foreground">{e.summary}</span>
                      {e.entityId && (
                        <span className="text-xs font-mono ml-2 opacity-50">ID: {e.entityId}</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Activity className="h-8 w-8 mb-2 opacity-30" />
                      <p>No audit events found for this period.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <div className="text-xs text-muted-foreground">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
            </div>
            <div className="flex gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
                className="h-8"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="h-8"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
