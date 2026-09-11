import React, { useState } from "react";
import {
  getGetCurrentRegisterShiftQueryKey,
  getListRegisterShiftsQueryKey,
  useCloseRegisterShift,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export type CashierShift = {
  id: string;
  openingCash: string | number;
  expectedCash?: string | number | null;
  closingCash?: string | number | null;
  variance?: string | number | null;
};

type CashierShiftDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentShift: CashierShift | null;
};

export function CashierShiftDialog({ open, onOpenChange, currentShift }: CashierShiftDialogProps) {
  const [closingCash, setClosingCash] = useState("");
  const queryClient = useQueryClient();

  const closeShift = useCloseRegisterShift({
    mutation: {
      onSuccess: (shift) => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentRegisterShiftQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListRegisterShiftsQueryKey() });
        setClosingCash("");
        onOpenChange(false);
        const settledShift = shift as CashierShift;
        toast.success(
          `Settlement complete. Expected ${formatCurrency(Number(settledShift.expectedCash ?? 0))}; ` +
          `counted ${formatCurrency(Number(settledShift.closingCash ?? 0))}; ` +
          `variance ${formatCurrency(Number(settledShift.variance ?? 0))}.`,
        );
      },
      onError: (error) => toast.error(error.message || "Could not settle the cashier day."),
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(closingCash);
    if (!currentShift || !Number.isFinite(amount) || amount < 0) {
      toast.error("Enter the physical cash counted at clock out.");
      return;
    }
    closeShift.mutate({ id: currentShift.id, data: { closingCash: amount } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clock out & settle</DialogTitle>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <p className="text-sm text-muted-foreground">
            Count all physical cash in the drawer and enter the amount before closing this cashier day.
          </p>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Opening float</span>
              <span className="font-medium">{formatCurrency(Number(currentShift?.openingCash ?? 0))}</span>
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-muted-foreground">Expected cash</span>
              <span className="font-medium">Calculated at settlement</span>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="closing-cash" className="text-sm font-medium">Physical cash counted</label>
            <Input
              id="closing-cash"
              type="number"
              min="0"
              step="0.01"
              value={closingCash}
              onChange={(event) => setClosingCash(event.target.value)}
              placeholder="0.00"
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={closeShift.isPending}>
              {closeShift.isPending ? "Settling..." : "Clock out"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}