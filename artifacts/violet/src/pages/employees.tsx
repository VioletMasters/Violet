import React, { useState } from "react";
import { useListEmployees, useCreateEmployee, useGetSubscription } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Shield, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const employeeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  role: z.enum(["manager", "cashier", "inventory_staff", "accountant", "employee"]),
  department: z.string().optional().or(z.literal("")),
});

type EmployeeForm = z.infer<typeof employeeSchema>;

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: employees } = useListEmployees();
  const { data: subscription } = useGetSubscription();
  
  const isFreePlan = user?.role !== "super_admin" && subscription?.plan?.tier === "free";
  
  const filteredEmployees = employees?.filter(e => 
    e.firstName.toLowerCase().includes(search.toLowerCase()) || 
    e.lastName.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      role: "cashier"
    }
  });

  const createMutation = useCreateEmployee({
    mutation: {
      onSuccess: () => {
        toast.success("Employee added");
        setIsAddOpen(false);
        reset();
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      },
      onError: (e) => toast.error(e.message || "Failed to add employee")
    }
  });

  const onSubmit = (data: EmployeeForm) => {
    createMutation.mutate({ data: {
      ...data,
      email: data.email || undefined,
      phone: data.phone || undefined,
      department: data.department || undefined
    }});
  };

  if (isFreePlan) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-6">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Employee Management</h1>
        <p className="text-muted-foreground text-lg">
          Employee accounts and role-based permissions are available on Starter and Professional plans.
        </p>
        <div className="bg-card border border-border/50 rounded-xl p-6 w-full text-left">
          <h3 className="font-semibold mb-3">Upgrade unlocks:</h3>
          <ul className="space-y-2 text-sm text-muted-foreground mb-6">
            <li className="flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> Separate login credentials</li>
            <li className="flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> Cashier shift tracking</li>
            <li className="flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> Role-based access control</li>
          </ul>
          <Link href="/subscription">
            <Button className="w-full">View Plans</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground mt-1">Manage staff access and roles</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Employee
        </Button>
      </div>

      <div className="flex items-center space-x-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search employees..." 
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
              <TableHead>Employee</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No employees found.</TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-xs shrink-0">
                        {emp.firstName[0]}{emp.lastName[0]}
                      </div>
                      <div>
                        <div className="font-medium">{emp.firstName} {emp.lastName}</div>
                        <div className="text-xs text-muted-foreground">{emp.email || emp.phone || "No contact info"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{emp.role.replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{emp.department || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={emp.isActive ? "success" : "secondary"}>
                      {emp.isActive ? "Active" : "Inactive"}
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
            <DialogTitle>Add Employee</DialogTitle>
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
              <Label>Email (Required for login)</Label>
              <Input type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select onValueChange={(val: any) => setValue("role", val)} defaultValue="cashier">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="inventory_staff">Inventory Staff</SelectItem>
                    <SelectItem value="accountant">Accountant</SelectItem>
                    <SelectItem value="employee">Basic Employee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input {...register("department")} />
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding..." : "Add Employee"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}