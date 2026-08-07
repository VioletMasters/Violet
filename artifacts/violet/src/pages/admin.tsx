import React, { useState } from "react";
import { useGetAdminStats, useListTenants, useUpdateAdminTenant } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Search, ShieldAlert, Building2, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { TenantUpdateStatus } from "@workspace/api-client-react";

export default function AdminPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: tenantsData, isLoading: tenantsLoading } = useListTenants({ search });
  
  const tenants = tenantsData?.data || [];

  const updateTenant = useUpdateAdminTenant({
    mutation: {
      onSuccess: () => {
        toast.success("Tenant status updated");
        queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      },
      onError: (e) => toast.error(e.message || "Failed to update tenant")
    }
  });

  const toggleTenantStatus = (id: string, currentStatus: string) => {
    const newStatus: TenantUpdateStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    if (confirm(`Are you sure you want to ${newStatus === 'suspended' ? 'suspend' : 'activate'} this tenant?`)) {
      updateTenant.mutate({ id, data: { status: newStatus } });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 pb-4 border-b border-border/50">
        <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Super Admin Portal</h1>
          <p className="text-muted-foreground mt-1">Platform overview and tenant management</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Monthly MRR</p>
              <div className="text-2xl font-bold">{statsLoading ? "..." : formatCurrency(stats?.mrr || 0)}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Building2 className="w-6 h-6 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Tenants</p>
              <div className="text-2xl font-bold">{statsLoading ? "..." : stats?.activeTenants || 0}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
              <Users className="w-6 h-6 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Users (Platform)</p>
              <div className="text-2xl font-bold">{statsLoading ? "..." : "—"}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Registered Tenants</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by business name..." 
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading tenants...</TableCell>
                  </TableRow>
                ) : tenants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No tenants found.</TableCell>
                  </TableRow>
                ) : (
                  tenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-xs text-muted-foreground">{tenant.email || "No email"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tenant.planName}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(tenant.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tenant.status === 'active' ? 'success' : tenant.status === 'suspended' ? 'destructive' : 'secondary'} className="uppercase text-[10px]">
                          {tenant.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => toggleTenantStatus(tenant.id, tenant.status)}
                          className={tenant.status === 'suspended' ? 'text-green-500 hover:text-green-600' : 'text-destructive hover:text-destructive'}
                          disabled={updateTenant.isPending}
                        >
                          {tenant.status === 'suspended' ? 'Activate' : 'Suspend'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}