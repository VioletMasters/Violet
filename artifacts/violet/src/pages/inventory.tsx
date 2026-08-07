import React, { useState } from "react";
import { useListInventory, useAdjustInventory } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, History } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { InventoryItem } from "@workspace/api-client-react";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  
  const [adjustment, setAdjustment] = useState("");
  const [reason, setReason] = useState<"purchase"|"damage"|"theft"|"correction"|"return"|"transfer">("purchase");
  const [note, setNote] = useState("");

  const queryClient = useQueryClient();
  const { data: inventoryData, isLoading } = useListInventory({ search });
  const items = inventoryData?.data || [];

  const adjustMutation = useAdjustInventory({
    mutation: {
      onSuccess: () => {
        toast.success("Inventory adjusted successfully");
        setAdjustItem(null);
        setAdjustment("");
        setNote("");
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      },
      onError: (err) => {
        toast.error(err.message || "Failed to adjust inventory");
      }
    }
  });

  const handleAdjust = () => {
    if (!adjustItem || !adjustment) return;
    const qty = parseInt(adjustment, 10);
    if (isNaN(qty)) return;

    adjustMutation.mutate({
      data: {
        productId: adjustItem.productId,
        adjustment: qty,
        reason,
        note
      }
    });
  };

  const getStatusBadge = (status: string, stock: number, minStock: number) => {
    if (status === "out_of_stock") return <Badge variant="destructive">Out of Stock</Badge>;
    if (status === "low_stock") return <Badge variant="warning">Low Stock ({stock}/{minStock})</Badge>;
    return <Badge variant="success">In Stock</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground mt-1">Track and adjust your stock levels</p>
        </div>
      </div>

      <div className="flex items-center space-x-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search SKU or name..." 
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
              <TableHead>Product / SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Current Stock</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading inventory...</TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No inventory items found.</TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell>
                    <div className="font-medium">{item.productName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                  </TableCell>
                  <TableCell>{item.categoryName || "—"}</TableCell>
                  <TableCell className="text-right font-bold font-mono text-lg">{item.stock}</TableCell>
                  <TableCell className="text-center">
                    {getStatusBadge(item.status, item.stock, item.minStock)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="secondary" size="sm" onClick={() => setAdjustItem(item)}>
                      Adjust
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!adjustItem} onOpenChange={(open) => !open && setAdjustItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>
              {adjustItem?.productName} (Current: {adjustItem?.stock})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity to Add/Remove</Label>
                <Input 
                  type="number" 
                  placeholder="e.g. 5 or -2" 
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Use negative numbers to reduce stock.</p>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Select value={reason} onValueChange={(val: any) => setReason(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">New Stock Received</SelectItem>
                    <SelectItem value="correction">Inventory Correction</SelectItem>
                    <SelectItem value="damage">Damaged Goods</SelectItem>
                    <SelectItem value="theft">Theft/Loss</SelectItem>
                    <SelectItem value="return">Customer Return</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for adjustment..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustItem(null)}>Cancel</Button>
            <Button onClick={handleAdjust} disabled={!adjustment || adjustMutation.isPending}>
              {adjustMutation.isPending ? "Saving..." : "Confirm Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}