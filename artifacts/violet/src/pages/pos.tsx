import React, { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getGetCurrentRegisterShiftQueryKey,
  getListPosProductsQueryKey,
  getListRegisterShiftsQueryKey,
  listPosProducts,
  useConfirmManagerPassword,
  useCloseRegisterShift,
  useCreateSale,
  useGetCurrentRegisterShift,
  useGetPosTaxSettings,
  useListRegisters,
  useListPosProducts,
  useOpenRegisterShift,
  useRetryPrintJob,
} from "@workspace/api-client-react";
import { Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, ArrowLeftRight, Package, Clock3, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import type { PosProduct, SaleInputPaymentMethod, PrintJob } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { dispatchSalePrintJobs } from "@/lib/desktop-print";

interface CartItem extends PosProduct {
  cartQuantity: number;
}

type PendingCartRemoval = {
  productId: string;
  action: "remove" | "decrement";
};

type VoidedCartItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  reason: string;
};

type PaymentCompletion = {
  tendered?: number;
  change: number;
  receiptNumber?: string;
  printJobs?: PrintJob[];
};

type StockConflict = {
  code: "STOCK_CHANGED";
  productId: string;
  productName: string;
  requestedQuantity: number;
  currentStock: number;
};

type RegisterShift = {
  id: string;
  storeId: string;
  registerId: string;
  cashierId: string;
  openingCash: string | number;
  expectedCash?: string | number | null;
  closingCash?: string | number | null;
  variance?: string | number | null;
  openedAt: string;
};

type RegisterOption = {
  id: string;
  name: string;
  code: string;
  storeId: string;
  isActive?: boolean;
};

const POS_PRODUCT_REFRESH_INTERVAL_MS = 3_000;

function createCheckoutIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export default function POSPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [voidedCartItems, setVoidedCartItems] = useState<VoidedCartItem[]>([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SaleInputPaymentMethod>("cash");
  const [cashTendered, setCashTendered] = useState<string>("");
  const [cashPaymentAmount, setCashPaymentAmount] = useState<string>("");
  const [cardPaymentAmount, setCardPaymentAmount] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [pendingCartRemoval, setPendingCartRemoval] = useState<PendingCartRemoval | null>(null);
  const [managerEmail, setManagerEmail] = useState(user?.email ?? "");
  const [managerPassword, setManagerPassword] = useState("");
  const [paymentCompletion, setPaymentCompletion] = useState<PaymentCompletion | null>(null);
  const [stockConflict, setStockConflict] = useState<StockConflict | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [selectedRegisterId, setSelectedRegisterId] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const checkoutAttemptKey = React.useRef<string | null>(null);
  const queryClient = useQueryClient();
  const retryPrintJob = useRetryPrintJob({
    mutation: {
      onSuccess: () => toast.success("Print job queued again."),
      onError: (error) => toast.error(error.message || "Could not retry this print job."),
    },
  });

  const normalizedSearch = search.replace(/[\r\n]+/g, "").trim();
  const productParams = { search: normalizedSearch, limit: 50 };
  const { data: productsData, isLoading } = useListPosProducts(
    productParams,
    {
      query: {
        queryKey: getListPosProductsQueryKey(productParams),
        refetchInterval: POS_PRODUCT_REFRESH_INTERVAL_MS,
      },
    },
  );
  const {
    data: posTaxSettings,
    isLoading: isLoadingTaxSettings,
    isError: hasTaxSettingsError,
  } = useGetPosTaxSettings();
  const { data: currentShiftResponse, isLoading: isLoadingShift } = useGetCurrentRegisterShift();
  const { data: registersResponse } = useListRegisters();
  const currentShift = (currentShiftResponse as { shift?: RegisterShift | null } | undefined)?.shift ?? null;
  const registers = ((registersResponse as { data?: RegisterOption[] } | undefined)?.data ?? [])
    .filter((register) => register.isActive !== false);
  const products = productsData?.data || [];

  React.useEffect(() => {
    if (!selectedRegisterId && registers.length === 1) {
      setSelectedRegisterId(registers[0].id);
    }
  }, [registers, selectedRegisterId]);

  const openShift = useOpenRegisterShift({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentRegisterShiftQueryKey() });
        setOpeningCash("");
        setShiftDialogOpen(false);
        toast.success("Cashier day started.");
      },
      onError: (error) => toast.error(error.message || "Could not start the cashier day."),
    },
  });

  const closeShift = useCloseRegisterShift({
    mutation: {
      onSuccess: (shift) => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentRegisterShiftQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListRegisterShiftsQueryKey() });
        setClosingCash("");
        setSettlementDialogOpen(false);
        const settledShift = shift as RegisterShift;
        toast.success(
          `Settlement complete. Expected ${formatCurrency(Number(settledShift.expectedCash ?? 0))}; ` +
          `counted ${formatCurrency(Number(settledShift.closingCash ?? 0))}; ` +
          `variance ${formatCurrency(Number(settledShift.variance ?? 0))}.`,
        );
      },
      onError: (error) => toast.error(error.message || "Could not settle the cashier day."),
    },
  });

  const createSale = useCreateSale({
    mutation: {
      onSuccess: (sale) => {
        // Stock is deducted by the sale transaction. Refresh every search variant
        // so the visible POS cards show the confirmed on-hand quantity immediately.
        queryClient.invalidateQueries({ queryKey: getListPosProductsQueryKey() });
        const hasCashPayment = paymentMethod === "cash" || paymentMethod === "mixed";
        const cashAppliedAmount = paymentMethod === "mixed"
          ? Number.parseFloat(cashPaymentAmount)
          : total;
        const tendered = hasCashPayment
          ? Number(sale.cashTendered ?? sale.cashReceived ?? cashTendered)
          : undefined;
        const change = tendered != null && Number.isFinite(tendered) && Number.isFinite(cashAppliedAmount)
          ? Math.max(0, tendered - cashAppliedAmount)
          : 0;
        toast.success("Sale completed successfully!");
        setCart([]);
        setVoidedCartItems([]);
        setPaymentModalOpen(false);
        setCashTendered("");
        setCashPaymentAmount("");
        setCardPaymentAmount("");
        setPaymentCompletion({
          tendered: hasCashPayment && tendered != null && Number.isFinite(tendered) ? tendered : undefined,
          change,
          receiptNumber: sale.receiptNumber,
          printJobs: sale.printJobs,
        });
        void dispatchSalePrintJobs(sale.printJobs);
        checkoutAttemptKey.current = null;
      },
      onError: (err) => {
        const status = (err as { status?: number }).status;
        const data = (err as { data?: unknown }).data;
        if (
          status === 409
          && data
          && typeof data === "object"
          && (data as { code?: unknown }).code === "STOCK_CHANGED"
        ) {
          const conflict = data as StockConflict;
          setStockConflict(conflict);
          checkoutAttemptKey.current = null;
          queryClient.invalidateQueries({ queryKey: getListPosProductsQueryKey() });
          return;
        }
        if (!status || status >= 500) {
          toast.error("The store server did not confirm the sale. Keep this cart open and press Complete Payment again when the connection returns.");
          return;
        }
        toast.error(err.message || "Failed to complete sale");
      }
    }
  });

  const managerConfirmation = useConfirmManagerPassword();

  const addToCart = (product: PosProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.cartQuantity >= product.stock) {
          toast.error("Not enough stock");
          return prev;
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item
        );
      }
      if (product.stock <= 0) {
        toast.error("Product is out of stock");
        return prev;
      }
      return [...prev, { ...product, cartQuantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          const newQty = item.cartQuantity + delta;
          if (newQty > item.stock) {
            toast.error("Not enough stock");
            return item;
          }
          if (newQty <= 0) return item; // Handled by remove
          return { ...item, cartQuantity: newQty };
        }
        return item;
      })
    );
  };

  const applyCartRemoval = (removal: PendingCartRemoval) => {
    const item = cart.find((cartItem) => cartItem.id === removal.productId);
    if (!item) return;
    const quantity = removal.action === "remove" ? item.cartQuantity : 1;
    setVoidedCartItems((prev) => [
      ...prev,
      {
        productId: item.id,
        productName: item.name,
        quantity,
        unitPrice: item.price,
        reason: "Removed from cart",
      },
    ]);
    setCart((prev) => prev.flatMap((cartItem) => {
      if (cartItem.id !== removal.productId) return [cartItem];
      if (removal.action === "remove") return [];
      return [{ ...cartItem, cartQuantity: cartItem.cartQuantity - 1 }];
    }));
  };

  const requestCartRemoval = (removal: PendingCartRemoval) => {
    if (!posTaxSettings?.requireManagerPasswordForCartRemoval) {
      applyCartRemoval(removal);
      return;
    }
    setManagerEmail(user?.email ?? "");
    setManagerPassword("");
    setPendingCartRemoval(removal);
  };

  const resolveStockConflict = (action: "remove" | "adjust") => {
    if (!stockConflict) return;
    setCart((prev) => prev.flatMap((item) => {
      if (item.id !== stockConflict.productId) return [item];
      if (action === "remove" || stockConflict.currentStock <= 0) return [];
      return [{
        ...item,
        stock: stockConflict.currentStock,
        cartQuantity: Math.min(item.cartQuantity, stockConflict.currentStock),
      }];
    }));
    setStockConflict(null);
    setPaymentModalOpen(false);
  };

  const confirmCartRemoval = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingCartRemoval) return;

    const removal = pendingCartRemoval;
    managerConfirmation.mutate(
      { data: { email: managerEmail.trim(), password: managerPassword } },
      {
        onSuccess: () => {
          applyCartRemoval(removal);
          setPendingCartRemoval(null);
          setManagerPassword("");
          toast.success("Manager approval confirmed.");
        },
        onError: () => {
          toast.error("Those manager credentials could not be verified.");
        },
      },
    );
  };

  const handleSearchKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !normalizedSearch || isScanning) return;
    event.preventDefault();
    setIsScanning(true);

    try {
      const results = await listPosProducts({ search: normalizedSearch, limit: 50 });
      const exactTerm = normalizedSearch.toLocaleLowerCase();
      const exactMatches = results.data.filter((product) => (
        product.sku.trim().toLocaleLowerCase() === exactTerm ||
        product.barcode?.trim().toLocaleLowerCase() === exactTerm ||
        product.name.trim().toLocaleLowerCase() === exactTerm
      ));

      if (exactMatches.length === 1) {
        addToCart(exactMatches[0]);
        setSearch("");
      } else if (exactMatches.length > 1) {
        toast.error("More than one product matches exactly. Select the item from the results.");
      } else {
        toast.error("No exact product match found.");
      }
    } catch {
      toast.error("Unable to look up that product. Try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.cartQuantity, 0), [cart]);
  const taxRate = posTaxSettings?.taxRate ?? 0;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;
  const checkoutUnavailable = isLoadingTaxSettings || hasTaxSettingsError || isLoadingShift || !currentShift;
  const parsedCashTendered = Number.parseFloat(cashTendered);
  const parsedCashPaymentAmount = Number.parseFloat(cashPaymentAmount);
  const parsedCardPaymentAmount = Number.parseFloat(cardPaymentAmount);
  const splitPaymentsTotal = (Number.isFinite(parsedCashPaymentAmount) ? parsedCashPaymentAmount : 0)
    + (Number.isFinite(parsedCardPaymentAmount) ? parsedCardPaymentAmount : 0);
  const splitPaymentRemaining = total - splitPaymentsTotal;
  const cashPaymentInvalid = paymentMethod === "cash" && (
    !cashTendered
    || !Number.isFinite(parsedCashTendered)
    || parsedCashTendered < total
  );
  const splitPaymentInvalid = paymentMethod === "mixed" && (
    !cashPaymentAmount
    || !cardPaymentAmount
    || !Number.isFinite(parsedCashPaymentAmount)
    || !Number.isFinite(parsedCardPaymentAmount)
    || parsedCashPaymentAmount <= 0
    || parsedCardPaymentAmount <= 0
    || Math.abs(splitPaymentsTotal - total) > 0.005
    || !cashTendered
    || !Number.isFinite(parsedCashTendered)
    || parsedCashTendered < parsedCashPaymentAmount
  );
  const paymentInvalid = cashPaymentInvalid || splitPaymentInvalid;

  const handleCheckout = () => {
    if (cart.length === 0 || !currentShift) return;
    if (paymentInvalid) {
      toast.error(paymentMethod === "mixed"
        ? "Enter valid cash and card amounts that add up to the total."
        : "Cash received must cover the total due.");
      return;
    }
    const idempotencyKey = checkoutAttemptKey.current ?? createCheckoutIdempotencyKey();
    checkoutAttemptKey.current = idempotencyKey;
    
    createSale.mutate({
      data: {
        idempotencyKey,
        paymentMethod,
        items: cart.map(item => ({
          productId: item.id,
          quantity: item.cartQuantity,
          unitPrice: item.price
        })),
        voidedItems: voidedCartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          reason: item.reason,
        })),
        payments: paymentMethod === "mixed"
          ? [
              {
                method: "cash",
                amount: parsedCashPaymentAmount,
                tenderedAmount: parsedCashTendered,
              },
              {
                method: "card",
                amount: parsedCardPaymentAmount,
              },
            ]
          : undefined,
        cashTendered: paymentMethod === "cash" && cashTendered ? parseFloat(cashTendered) : undefined,
        storeId: currentShift.storeId,
        registerId: currentShift.registerId,
        shiftId: currentShift.id,
      }
    });
  };

  const handleStartShift = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(openingCash);
    if (!selectedRegisterId || !Number.isFinite(amount) || amount < 0) {
      toast.error("Choose a register and enter a valid opening float.");
      return;
    }
    openShift.mutate({ data: { registerId: selectedRegisterId, openingCash: amount } });
  };

  const handleSettleShift = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(closingCash);
    if (!currentShift || !Number.isFinite(amount) || amount < 0) {
      toast.error("Enter the physical cash counted at clock out.");
      return;
    }
    closeShift.mutate({ id: currentShift.id, data: { closingCash: amount } });
  };

  React.useEffect(() => {
    if (!paymentCompletion) return;

    const handleCompletionKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setPaymentCompletion(null);
    };

    window.addEventListener("keydown", handleCompletionKeyDown);
    return () => window.removeEventListener("keydown", handleCompletionKeyDown);
  }, [paymentCompletion]);

  return (
    <div className="h-[calc(100vh-theme(spacing.16)-theme(spacing.8))] flex gap-6 overflow-hidden relative">
      {/* Products Grid */}
      <div className="flex-1 flex flex-col min-w-0 bg-background rounded-xl border border-border/50 overflow-hidden shadow-sm">
        <div className={`border-b px-4 py-3 ${currentShift ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${currentShift ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-700"}`}>
                <Clock3 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {isLoadingShift ? "Checking cashier day..." : currentShift ? "Cashier day is active" : "Cashier day not started"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {currentShift
                    ? `Opening float ${formatCurrency(Number(currentShift.openingCash))}`
                    : "Start a register shift before processing sales."}
                </p>
              </div>
            </div>
            {currentShift ? (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setSettlementDialogOpen(true)}>
                <LogOut className="h-4 w-4" /> Clock out & settle
              </Button>
            ) : (
              <Button size="sm" className="gap-2" onClick={() => setShiftDialogOpen(true)} disabled={registers.length === 0}>
                <LogIn className="h-4 w-4" /> Start day
              </Button>
            )}
          </div>
          {!isLoadingShift && !currentShift && registers.length === 0 && (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">No registers are configured yet. Ask a manager to set one up.</p>
          )}
        </div>
        <div className="p-4 border-b border-border/50 flex gap-4 bg-card">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search products, SKU, barcode... (Press '/')" 
              className="pl-9 h-11 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value.replace(/[\r\n]+/g, ""))}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 bg-secondary/20">
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.stock <= 0}
                  className={`text-left flex flex-col p-4 rounded-xl border transition-all ${
                    product.stock <= 0 
                      ? "opacity-50 cursor-not-allowed border-border/50 bg-background" 
                      : "bg-card hover:border-primary/50 hover:shadow-md active:scale-[0.98] border-border/50"
                  }`}
                >
                  <div className="flex justify-between items-start w-full mb-2">
                    <span className="font-semibold text-primary">{formatCurrency(product.price)}</span>
                    <Badge variant={product.stock > 10 ? "secondary" : product.stock > 0 ? "warning" : "destructive"}>
                      {product.stock} in stock
                    </Badge>
                  </div>
                  <h3 className="font-medium line-clamp-2 mt-auto">{product.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{product.sku}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Package className="w-12 h-12 mb-4 opacity-20" />
              <p>No products found</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-96 flex flex-col bg-card rounded-xl border border-border/50 overflow-hidden shadow-sm shrink-0">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="font-display font-semibold flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> Current Sale
          </h2>
          <Badge variant="secondary">{cart.reduce((sum, item) => sum + item.cartQuantity, 0)} items</Badge>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 p-4 text-center">
              <ShoppingCart className="w-12 h-12 mb-4" />
              <p>Cart is empty. Select products to begin a sale.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => (
                <div key={item.id} className="p-3 bg-background rounded-lg border border-border/50 flex flex-col gap-2">
                  <div className="flex justify-between">
                    <span className="font-medium line-clamp-1">{item.name}</span>
                    <span className="font-semibold">{formatCurrency(item.price * item.cartQuantity)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center border border-border/80 rounded-md bg-secondary/50">
                      <button 
                        onClick={() => {
                          if (item.cartQuantity <= 1) requestCartRemoval({ productId: item.id, action: "remove" });
                          else updateQuantity(item.id, -1);
                        }}
                        className="w-8 h-8 flex items-center justify-center hover:bg-background rounded-l-md transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium">{item.cartQuantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.id, 1)}
                        disabled={item.cartQuantity >= item.stock}
                        className="w-8 h-8 flex items-center justify-center hover:bg-background rounded-r-md transition-colors disabled:opacity-50"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button 
                      onClick={() => requestCartRemoval({ productId: item.id, action: "remove" })}
                      className="text-muted-foreground hover:text-destructive p-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {posTaxSettings?.showVoidedItems && voidedCartItems.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-dashed border-amber-500/40 pt-4">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Voided items
                </span>
                <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                  Internal only
                </Badge>
              </div>
              {voidedCartItems.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="rounded-lg border border-dashed border-amber-500/35 bg-amber-500/5 p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="line-clamp-1 text-muted-foreground">{item.productName}</span>
                    <span className="shrink-0 text-muted-foreground line-through">
                      {item.quantity} × {formatCurrency(item.unitPrice)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">{item.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals & Checkout */}
        <div className="p-4 border-t border-border/50 bg-background space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{posTaxSettings?.taxName || "Tax"}</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t border-border/50">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
            {hasTaxSettingsError && (
              <p className="text-sm text-destructive" role="alert">
                Tax settings could not be loaded. Checkout is unavailable.
              </p>
            )}
          </div>
          
          <Button 
            className="w-full h-14 text-lg font-bold" 
            disabled={cart.length === 0 || checkoutUnavailable}
            onClick={() => {
              checkoutAttemptKey.current = null;
              setPaymentModalOpen(true);
            }}
          >
            {isLoadingTaxSettings ? "Loading tax settings..." : `Charge ${formatCurrency(total)}`}
          </Button>
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog
        open={shiftDialogOpen}
        onOpenChange={setShiftDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start cashier day</DialogTitle>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleStartShift}>
            <p className="text-sm text-muted-foreground">Choose the register and record the physical cash placed in the drawer before sales begin.</p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Register</label>
              <Select value={selectedRegisterId} onValueChange={setSelectedRegisterId}>
                <SelectTrigger><SelectValue placeholder="Choose a register" /></SelectTrigger>
                <SelectContent>
                  {registers.map((register) => (
                    <SelectItem key={register.id} value={register.id}>{register.name} ({register.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="opening-float" className="text-sm font-medium">Opening float</label>
              <Input id="opening-float" type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} placeholder="0.00" required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShiftDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={openShift.isPending}>{openShift.isPending ? "Starting..." : "Start day"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={settlementDialogOpen}
        onOpenChange={setSettlementDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clock out & settle</DialogTitle>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSettleShift}>
            <p className="text-sm text-muted-foreground">Count all physical cash in the drawer and enter the amount before closing this cashier day.</p>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Opening float</span><span className="font-medium">{formatCurrency(Number(currentShift?.openingCash ?? 0))}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Expected cash</span><span className="font-medium">Calculated at settlement</span></div>
            </div>
            <div className="space-y-2">
              <label htmlFor="closing-cash" className="text-sm font-medium">Physical cash counted</label>
              <Input id="closing-cash" type="number" min="0" step="0.01" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} placeholder="0.00" required autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSettlementDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={closeShift.isPending}>{closeShift.isPending ? "Settling..." : "Clock out"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentModalOpen}
        onOpenChange={(open) => {
          if (!createSale.isPending) setPaymentModalOpen(open);
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 px-6 pb-3 pt-6">
            <DialogTitle className="text-2xl text-center">Complete Payment</DialogTitle>
          </DialogHeader>
          
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="text-center mb-8">
              <div className="text-sm text-muted-foreground uppercase tracking-widest font-bold mb-1">Total Due</div>
              <div className="text-5xl font-display font-bold text-primary">{formatCurrency(total)}</div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <Button 
                type="button"
                variant={paymentMethod === "cash" ? "default" : "outline"} 
                className="h-16 flex flex-col gap-1 items-center justify-center px-2"
                onClick={() => setPaymentMethod("cash")}
              >
                <Banknote className="w-6 h-6" />
                <span>Cash</span>
              </Button>
              <Button 
                type="button"
                variant={paymentMethod === "card" ? "default" : "outline"} 
                className="h-16 flex flex-col gap-1 items-center justify-center px-2"
                onClick={() => setPaymentMethod("card")}
              >
                <CreditCard className="w-6 h-6" />
                <span>Card</span>
              </Button>
              <Button
                type="button"
                variant={paymentMethod === "mixed" ? "default" : "outline"}
                className="h-16 flex flex-col gap-1 items-center justify-center px-2"
                onClick={() => setPaymentMethod("mixed")}
              >
                <ArrowLeftRight className="w-6 h-6" />
                <span>Split</span>
              </Button>
            </div>

            {paymentMethod === "cash" && (
              <div className="space-y-3 p-4 bg-secondary rounded-lg mb-6 border border-border/50">
                <label className="text-sm font-medium">Cash Received</label>
                <Input 
                  type="number" 
                  step="0.01" 
                  className="h-12 text-lg font-mono bg-background" 
                  placeholder={total.toString()}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  autoFocus
                  required
                />
                {!cashTendered && (
                  <p className="text-xs text-muted-foreground">Enter the amount the customer handed over.</p>
                )}
                {cashTendered && parsedCashTendered < total && (
                  <p className="text-xs text-destructive">Cash received must cover the total due.</p>
                )}
                {cashTendered && parsedCashTendered >= total && (
                  <div className="flex justify-between text-sm pt-2 text-green-500 font-medium">
                    <span>Change Due:</span>
                    <span>{formatCurrency(parsedCashTendered - total)}</span>
                  </div>
                )}
              </div>
            )}

            {paymentMethod === "mixed" && (
              <div className="space-y-4 p-4 bg-secondary rounded-lg mb-6 border border-border/50">
                <div>
                  <p className="text-sm font-medium">Split between cash and card</p>
                  <p className="text-xs text-muted-foreground">Enter how much of the total each tender covers.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label htmlFor="split-cash-amount" className="text-sm font-medium">Cash portion</label>
                    <Input
                      id="split-cash-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="h-12 text-lg font-mono bg-background"
                      placeholder="0.00"
                      value={cashPaymentAmount}
                      onChange={(event) => setCashPaymentAmount(event.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="split-card-amount" className="text-sm font-medium">Card portion</label>
                    <Input
                      id="split-card-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="h-12 text-lg font-mono bg-background"
                      placeholder="0.00"
                      value={cardPaymentAmount}
                      onChange={(event) => setCardPaymentAmount(event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-3 text-sm">
                  <span className="text-muted-foreground">Amount applied</span>
                  <span className={Math.abs(splitPaymentRemaining) <= 0.005 ? "font-semibold text-green-500" : "font-semibold"}>
                    {formatCurrency(splitPaymentsTotal)}
                  </span>
                </div>
                {(!cashPaymentAmount || !cardPaymentAmount) && (
                  <p className="text-xs text-muted-foreground">Enter an amount for both cash and card.</p>
                )}
                {cashPaymentAmount && cardPaymentAmount && Math.abs(splitPaymentRemaining) > 0.005 && (
                  <p className="text-xs text-destructive">
                    {splitPaymentRemaining > 0
                      ? `Add ${formatCurrency(splitPaymentRemaining)} to complete the split.`
                      : `Reduce the split by ${formatCurrency(Math.abs(splitPaymentRemaining))}.`}
                  </p>
                )}
                <div className="space-y-3 border-t border-border/60 pt-3">
                  <label htmlFor="split-cash-tendered" className="text-sm font-medium">Cash received</label>
                  <Input
                    id="split-cash-tendered"
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-12 text-lg font-mono bg-background"
                    placeholder={Number.isFinite(parsedCashPaymentAmount) ? parsedCashPaymentAmount.toString() : "0.00"}
                    value={cashTendered}
                    onChange={(event) => setCashTendered(event.target.value)}
                  />
                  {!cashTendered && (
                    <p className="text-xs text-muted-foreground">Enter the cash handed over for the cash portion.</p>
                  )}
                  {cashTendered && Number.isFinite(parsedCashPaymentAmount) && parsedCashTendered < parsedCashPaymentAmount && (
                    <p className="text-xs text-destructive">Cash received must cover the cash portion.</p>
                  )}
                  {cashTendered && Number.isFinite(parsedCashPaymentAmount) && parsedCashTendered >= parsedCashPaymentAmount && (
                    <div className="flex justify-between text-sm text-green-500 font-medium">
                      <span>Change Due:</span>
                      <span>{formatCurrency(parsedCashTendered - parsedCashPaymentAmount)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <Button
              variant="outline"
              disabled={createSale.isPending}
              onClick={() => setPaymentModalOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              className="w-full sm:w-auto"
              onClick={handleCheckout}
              disabled={checkoutUnavailable || createSale.isPending || paymentInvalid}
            >
              {createSale.isPending ? "Processing..." : "Complete Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!stockConflict}
        onOpenChange={(open) => {
          if (!open) setStockConflict(null);
        }}
      >
        <AlertDialogContent aria-describedby="stock-conflict-description">
          <AlertDialogHeader>
            <AlertDialogTitle>Cart stock changed</AlertDialogTitle>
            <AlertDialogDescription id="stock-conflict-description">
              Another register sold {stockConflict?.productName}. You requested{" "}
              {stockConflict?.requestedQuantity}, but only {stockConflict?.currentStock} remain.
              Update this item to continue; the rest of the cart will stay unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => resolveStockConflict("remove")}
            >
              Remove item
            </Button>
            {Boolean(stockConflict && stockConflict.currentStock > 0) && (
              <AlertDialogAction onClick={() => resolveStockConflict("adjust")}>
                Adjust to {stockConflict?.currentStock}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!paymentCompletion}
        onOpenChange={(open) => {
          if (!open) setPaymentCompletion(null);
        }}
      >
        <AlertDialogContent
          className="border-primary/30 sm:max-w-lg"
          aria-describedby="payment-completion-description"
        >
          <AlertDialogHeader className="items-center text-center">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
              <Banknote className="h-8 w-8" />
            </div>
            <AlertDialogTitle className="text-2xl">Payment complete</AlertDialogTitle>
            <AlertDialogDescription id="payment-completion-description">
              {paymentCompletion?.receiptNumber
                ? `Receipt ${paymentCompletion.receiptNumber}`
                : "The sale was recorded successfully."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {paymentCompletion?.tendered != null && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Cash received</span>
              <span className="font-semibold">{formatCurrency(paymentCompletion.tendered)}</span>
            </div>
          )}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-6 py-7 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Change
            </p>
            <p className="mt-2 text-5xl font-display font-bold text-emerald-500">
              {formatCurrency(paymentCompletion?.change ?? 0)}
            </p>
          </div>
          {paymentCompletion?.printJobs && paymentCompletion.printJobs.length > 0 && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-left">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Printing</p>
                <span className="text-xs text-muted-foreground">Sale already completed</span>
              </div>
              {paymentCompletion.printJobs.map((job) => (
                <div key={job.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{job.documentType.replaceAll("_", " ")}</span>
                  <Badge variant={job.status === "printed" ? "secondary" : job.status === "failed" ? "destructive" : "outline"}>{job.status}</Badge>
                  {job.status === "failed" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={retryPrintJob.isPending}
                      onClick={() => retryPrintJob.mutate({ id: job.id })}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              ))}
              {paymentCompletion.printJobs.some((job) => job.status === "failed") && (
                <p className="text-xs text-muted-foreground">The transaction was saved. A manager can retry failed documents from Settings → Printers.</p>
              )}
            </div>
          )}
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction className="h-12 min-w-40 text-base">
              Okay
            </AlertDialogAction>
          </AlertDialogFooter>
          <p className="text-center text-xs text-muted-foreground">
            Press Okay, Enter, or Space to continue
          </p>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!pendingCartRemoval}
        onOpenChange={(open) => {
          if (!open && !managerConfirmation.isPending) {
            setPendingCartRemoval(null);
            setManagerPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manager approval required</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={confirmCartRemoval}>
            <p className="text-sm text-muted-foreground">
              A manager must confirm their password before this cart item can be removed. This approval only applies to the current action.
            </p>
            <div className="space-y-2">
              <label htmlFor="pos-manager-email" className="text-sm font-medium">Manager email</label>
              <Input
                id="pos-manager-email"
                type="email"
                autoComplete="username"
                value={managerEmail}
                onChange={(event) => setManagerEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="pos-manager-password" className="text-sm font-medium">Manager password</label>
              <Input
                id="pos-manager-password"
                type="password"
                autoComplete="current-password"
                value={managerPassword}
                onChange={(event) => setManagerPassword(event.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingCartRemoval(null)}
                disabled={managerConfirmation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={managerConfirmation.isPending}>
                {managerConfirmation.isPending ? "Verifying..." : "Approve removal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}