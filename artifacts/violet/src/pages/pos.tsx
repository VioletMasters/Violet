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
  listPosProducts,
  useConfirmManagerPassword,
  useCreateSale,
  useGetPosTaxSettings,
  useListPosProducts,
} from "@workspace/api-client-react";
import { Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, Package } from "lucide-react";
import { toast } from "sonner";
import type { PosProduct, SaleInputPaymentMethod } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";

interface CartItem extends PosProduct {
  cartQuantity: number;
}

type PendingCartRemoval = {
  productId: string;
  action: "remove" | "decrement";
};

type PaymentCompletion = {
  change: number;
  receiptNumber?: string;
};

function createCheckoutIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export default function POSPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SaleInputPaymentMethod>("cash");
  const [cashTendered, setCashTendered] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [pendingCartRemoval, setPendingCartRemoval] = useState<PendingCartRemoval | null>(null);
  const [managerEmail, setManagerEmail] = useState(user?.email ?? "");
  const [managerPassword, setManagerPassword] = useState("");
  const [paymentCompletion, setPaymentCompletion] = useState<PaymentCompletion | null>(null);
  const checkoutAttemptKey = React.useRef<string | null>(null);

  const normalizedSearch = search.replace(/[\r\n]+/g, "").trim();
  const { data: productsData, isLoading } = useListPosProducts({ search: normalizedSearch, limit: 50 });
  const {
    data: posTaxSettings,
    isLoading: isLoadingTaxSettings,
    isError: hasTaxSettingsError,
  } = useGetPosTaxSettings();
  const products = productsData?.data || [];

  const createSale = useCreateSale({
    mutation: {
      onSuccess: (sale) => {
        const tendered = paymentMethod === "cash" ? Number.parseFloat(cashTendered) : 0;
        const change = Number.isFinite(tendered) ? Math.max(0, tendered - total) : 0;
        toast.success("Sale completed successfully!");
        setCart([]);
        setPaymentModalOpen(false);
        setCashTendered("");
        setSearch("");
        setPaymentCompletion({ change, receiptNumber: sale.receiptNumber });
        checkoutAttemptKey.current = null;
      },
      onError: (err) => {
        const status = (err as { status?: number }).status;
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

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
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
    if (removal.action === "remove") {
      removeFromCart(removal.productId);
      return;
    }
    updateQuantity(removal.productId, -1);
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
  const checkoutUnavailable = isLoadingTaxSettings || hasTaxSettingsError;

  const handleCheckout = () => {
    if (cart.length === 0) return;
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
        cashTendered: paymentMethod === "cash" && cashTendered ? parseFloat(cashTendered) : undefined
      }
    });
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

            <div className="grid grid-cols-2 gap-4 mb-6">
              <Button 
                type="button"
                variant={paymentMethod === "cash" ? "default" : "outline"} 
                className="h-16 flex flex-col gap-1 items-center justify-center"
                onClick={() => setPaymentMethod("cash")}
              >
                <Banknote className="w-6 h-6" />
                <span>Cash</span>
              </Button>
              <Button 
                type="button"
                variant={paymentMethod === "card" ? "default" : "outline"} 
                className="h-16 flex flex-col gap-1 items-center justify-center"
                onClick={() => setPaymentMethod("card")}
              >
                <CreditCard className="w-6 h-6" />
                <span>Card</span>
              </Button>
            </div>

            {paymentMethod === "cash" && (
              <div className="space-y-3 p-4 bg-secondary rounded-lg mb-6 border border-border/50">
                <label className="text-sm font-medium">Cash Tendered</label>
                <Input 
                  type="number" 
                  step="0.01" 
                  className="h-12 text-lg font-mono bg-background" 
                  placeholder={total.toString()}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  autoFocus
                />
                {cashTendered && parseFloat(cashTendered) >= total && (
                  <div className="flex justify-between text-sm pt-2 text-green-500 font-medium">
                    <span>Change Due:</span>
                    <span>{formatCurrency(parseFloat(cashTendered) - total)}</span>
                  </div>
                )}
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
              disabled={checkoutUnavailable || createSale.isPending || (paymentMethod === "cash" && !!cashTendered && parseFloat(cashTendered) < total)}
            >
              {createSale.isPending ? "Processing..." : "Complete Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-6 py-7 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Change
            </p>
            <p className="mt-2 text-5xl font-display font-bold text-emerald-500">
              {formatCurrency(paymentCompletion?.change ?? 0)}
            </p>
          </div>
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