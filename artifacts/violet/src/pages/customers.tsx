import React, { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useListCustomers, useCreateCustomer } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, UserCircle, Star } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const customerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

type CustomerForm = z.infer<typeof customerSchema>;

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const { data: customersData, isLoading } = useListCustomers({ search });
  const customers = customersData?.data || [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema)
  });

  const createMutation = useCreateCustomer({
    mutation: {
      onSuccess: () => {
        toast.success("Customer added");
        setIsAddOpen(false);
        reset();
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      },
      onError: (e) => toast.error(e.message || "Failed to add customer")
    }
  });

  const onSubmit = (data: CustomerForm) => {
    createMutation.mutate({ data: {
      ...data,
      email: data.email || undefined,
      phone: data.phone || undefined,
      notes: data.notes || undefined
    }});
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground mt-1">Manage your customer relationships</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Customer
        </Button>
      </div>

      <div className="flex items-center space-x-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, email, phone..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Total Spent</TableHead>
              <TableHead className="text-right">Loyalty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading customers...</TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No customers found.</TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                        {customer.firstName[0]}{customer.lastName[0]}
                      </div>
                      <div>
                        <div className="font-medium">{customer.firstName} {customer.lastName}</div>
                        <div className="text-xs text-muted-foreground">Added {customer.createdAt ? formatDate(customer.createdAt) : ''}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{customer.email || "—"}</div>
                    <div className="text-xs text-muted-foreground">{customer.phone || "—"}</div>
                  </TableCell>
                  <TableCell className="text-right">{customer.totalOrders || 0}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(customer.totalPurchases || 0)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="gap-1">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      {customer.loyaltyPoints || 0} pts
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input {...register("firstName")} />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input {...register("lastName")} />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Phone</Label>
              <Input type="tel" {...register("phone")} />
            </div>

            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Input {...register("notes")} />
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding..." : "Add Customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}