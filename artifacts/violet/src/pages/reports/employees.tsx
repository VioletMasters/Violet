import React from "react";
import { useListEmployees } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Mail, Phone, Building } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function ReportsEmployees() {
  const { data: response, isLoading } = useListEmployees();

  const employees = (response as any)?.data || [];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Joined</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-32" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-24" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-48" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-16" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : employees.length > 0 ? (
                employees.map((e: any) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {e.firstName} {e.lastName}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {e.role.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground space-y-1">
                      {e.email && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Mail className="w-3 h-3 opacity-50" />
                          {e.email}
                        </div>
                      )}
                      {e.phone && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Phone className="w-3 h-3 opacity-50" />
                          {e.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.department ? (
                        <div className="flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 opacity-50" />
                          {e.department}
                        </div>
                      ) : (
                        <span className="opacity-50">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={e.isActive ? 'default' : 'secondary'} className="text-[10px] uppercase">
                        {e.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap text-xs">
                      {e.createdAt ? format(parseISO(e.createdAt), "MMM d, yyyy") : '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Users className="h-8 w-8 mb-2 opacity-30" />
                      <p>No employees found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
