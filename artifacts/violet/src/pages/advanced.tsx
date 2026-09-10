import React, { useEffect, useState } from "react";
import {
  getListRegistersQueryKey,
  getListStoresQueryKey,
  useCreateRegister,
  useCreateStore,
  useListRegisters,
  useListStores,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Store, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

type StoreOption = { id: string; code: string; name: string };
type RegisterOption = { id: string; code: string; name: string; storeId: string };

export default function AdvancedPage() {
  const { user, isManagerAccessActive } = useAuth();
  const queryClient = useQueryClient();
  const canConfigureStoresAndRegisters = user?.role === "owner" || user?.role === "administrator" || user?.role === "super_admin";
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [registerCode, setRegisterCode] = useState("");
  const [registerName, setRegisterName] = useState("");

  const { data: storesResponse } = useListStores({
    query: {
      queryKey: getListStoresQueryKey(),
      enabled: isManagerAccessActive,
    },
  });
  const stores = ((storesResponse as { data?: StoreOption[] } | undefined)?.data ?? []);
  const { data: registersResponse } = useListRegisters(
    selectedStoreId ? { storeId: selectedStoreId } : undefined,
    {
      query: {
        queryKey: getListRegistersQueryKey(selectedStoreId ? { storeId: selectedStoreId } : undefined),
        enabled: isManagerAccessActive && Boolean(selectedStoreId),
      },
    },
  );
  const registers = ((registersResponse as { data?: RegisterOption[] } | undefined)?.data ?? []);

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) {
      setSelectedStoreId(stores[0].id);
    }
  }, [selectedStoreId, stores]);

  const createStoreMutation = useCreateStore({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
        setStoreCode("");
        setStoreName("");
        toast.success("Store created.");
      },
      onError: (error) => toast.error(error.message || "Could not create the store."),
    },
  });

  const createRegisterMutation = useCreateRegister({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRegistersQueryKey(selectedStoreId ? { storeId: selectedStoreId } : undefined) });
        setRegisterCode("");
        setRegisterName("");
        toast.success("Register created and ready for cashier shifts.");
      },
      onError: (error) => toast.error(error.message || "Could not create the register."),
    },
  });

  const createStore = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!storeCode.trim() || !storeName.trim()) return;
    createStoreMutation.mutate({ data: { code: storeCode.trim(), name: storeName.trim() } });
  };

  const createRegister = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStoreId || !registerCode.trim() || !registerName.trim()) return;
    createRegisterMutation.mutate({
      data: { storeId: selectedStoreId, code: registerCode.trim(), name: registerName.trim() },
    });
  };

  if (!isManagerAccessActive) {
    return (
      <div className="mx-auto max-w-md pt-8">
        <Card className="border-primary/25 shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Manager access required</CardTitle>
            <CardDescription>Unlock manager access from Settings before opening Advanced settings.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Advanced</h1>
        <p className="mt-1 text-muted-foreground">Operational setup and register rules across your stores and Store Client PCs.</p>
      </div>

      {canConfigureStoresAndRegisters ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" /> Stores & registers</CardTitle>
            <CardDescription>Create the register that cashiers select when they start their day.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Create a store</h2>
                <p className="text-xs text-muted-foreground">Use a short unique code such as MAIN or UPTOWN.</p>
              </div>
              <form className="grid gap-3 sm:grid-cols-[0.7fr_1.3fr_auto]" onSubmit={createStore}>
                <Input value={storeCode} onChange={(event) => setStoreCode(event.target.value)} placeholder="Store code" aria-label="Store code" required />
                <Input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Store name" aria-label="Store name" required />
                <Button type="submit" disabled={createStoreMutation.isPending}>{createStoreMutation.isPending ? "Creating..." : "Create store"}</Button>
              </form>
            </div>

            <div className="border-t pt-6">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Create a register</h2>
                <p className="text-xs text-muted-foreground">Cashiers will see active registers in the Start cashier day dialog.</p>
              </div>
              <form className="grid gap-3 sm:grid-cols-[1fr_0.7fr_1.3fr_auto]" onSubmit={createRegister}>
                <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                  <SelectTrigger><SelectValue placeholder="Select a store" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name} ({store.code})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={registerCode} onChange={(event) => setRegisterCode(event.target.value)} placeholder="Register code" aria-label="Register code" required />
                <Input value={registerName} onChange={(event) => setRegisterName(event.target.value)} placeholder="Register name" aria-label="Register name" required />
                <Button type="submit" disabled={!selectedStoreId || createRegisterMutation.isPending}>{createRegisterMutation.isPending ? "Creating..." : "Create register"}</Button>
              </form>
            </div>

            <div className="border-t pt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Existing registers</h2>
                  <p className="text-xs text-muted-foreground">{selectedStoreId ? "Registers belonging to the selected store." : "Select a store to view its registers."}</p>
                </div>
                {selectedStoreId && <span className="text-xs text-muted-foreground">{registers.length} configured</span>}
              </div>
              {selectedStoreId && registers.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {registers.map((register) => (
                    <div key={register.id} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                      <div><p className="text-sm font-medium">{register.name}</p><p className="text-xs text-muted-foreground">{register.code}</p></div>
                      <span className="text-xs text-emerald-600">Available</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  {selectedStoreId ? "No registers configured for this store yet." : "Create or select a store first."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-amber-600" /> Register setup is restricted</CardTitle>
            <CardDescription>Only the business owner or administrator/IT role can create stores and registers. Ask one of them to complete this setup.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-primary" /> Register operating rules</CardTitle>
          <CardDescription>How register access works across cashier accounts and Store Client PCs.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3"><p className="font-medium">One active cashier</p><p className="mt-1 text-xs text-muted-foreground">A register cannot be started by a second cashier until the current cashier settles and clocks out.</p></div>
          <div className="rounded-lg border bg-muted/20 p-3"><p className="font-medium">Opening float is recorded</p><p className="mt-1 text-xs text-muted-foreground">Cashiers enter the physical starting cash, then count the drawer again at clock out for variance.</p></div>
          <div className="rounded-lg border bg-muted/20 p-3"><p className="font-medium">PCs are not locked yet</p><p className="mt-1 text-xs text-muted-foreground">The same cashier can continue the active shift from another PC. Permanent PC-to-register binding is not enabled.</p></div>
        </CardContent>
      </Card>
    </div>
  );
}