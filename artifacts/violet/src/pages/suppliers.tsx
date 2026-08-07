import React, { useState } from "react";
import { useListSuppliers, useCreateSupplier } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Truck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const supplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required"),
  contactName: z.string().optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
});

type SupplierForm = z.infer<typeof supplierSchema>;

export default function SuppliersPage() {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const { data: suppliers } = useListSuppliers();
  
  const filteredSuppliers = suppliers?.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema)
  });

  const createMutation = useCreateSupplier({
    mutation: {
      onSuccess: () => {
        toast.success("Supplier added");
        setIsAddOpen(false);
        reset();
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      },
      onError: (e) => toast.error(e.message || "Failed to add supplier")
    }
  });

  const onSubmit = (data: SupplierForm) => {
    createMutation.mutate({ data: {
      ...data,
      contactName: data.contactName || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      address: data.address || undefined
    }});
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground mt-1">Manage product vendors and distributors</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Supplier
        </Button>
      </div>

      <div className="flex items-center space-x-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search suppliers..." 
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
              <TableHead>Supplier Name</TableHead>
              <TableHead>Primary Contact</TableHead>
              <TableHead>Contact Info</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSuppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No suppliers found.</TableCell>
              </TableRow>
            ) : (
              filteredSuppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-secondary text-secondary-foreground flex items-center justify-center">
                        <Truck className="w-4 h-4" />
                      </div>
                      <span className="font-medium">{supplier.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{supplier.contactName || "—"}</TableCell>
                  <TableCell>
                    <div className="text-sm">{supplier.email || "—"}</div>
                    <div className="text-xs text-muted-foreground">{supplier.phone || "—"}</div>
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
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Supplier Name</Label>
              <Input {...register("name")} placeholder="Acme Distribution" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Primary Contact Name</Label>
              <Input {...register("contactName")} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input type="tel" {...register("phone")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Input {...register("address")} />
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding..." : "Add Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}