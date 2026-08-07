import React, { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { useListProducts, useCreateProduct, useUpdateProduct, useListCategories } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { Product } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  price: z.coerce.number().min(0, "Price must be >= 0"),
  costPrice: z.coerce.number().min(0).optional().or(z.literal("")),
  stock: z.coerce.number().int().min(0),
  minStock: z.coerce.number().int().min(0),
  categoryId: z.string().optional().or(z.literal("none")),
});

type ProductForm = z.infer<typeof productSchema>;

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const queryClient = useQueryClient();
  const { data: productsData, isLoading } = useListProducts({ search });
  const { data: categories } = useListCategories();
  
  const products = productsData?.data || [];

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      stock: 0,
      minStock: 5,
    }
  });

  const createMutation = useCreateProduct({
    mutation: {
      onSuccess: () => {
        toast.success("Product created");
        setIsSheetOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      },
      onError: (e) => toast.error(e.message || "Failed to create product")
    }
  });

  const updateMutation = useUpdateProduct({
    mutation: {
      onSuccess: () => {
        toast.success("Product updated");
        setIsSheetOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      },
      onError: (e) => toast.error(e.message || "Failed to update product")
    }
  });

  const openCreate = () => {
    setEditingProduct(null);
    reset({
      name: "", sku: "", price: 0, costPrice: 0, stock: 0, minStock: 5, categoryId: "none"
    });
    setIsSheetOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    reset({
      name: product.name,
      sku: product.sku,
      price: product.price,
      costPrice: product.costPrice || 0,
      stock: product.stock,
      minStock: product.minStock || 0,
      categoryId: product.categoryId || "none",
    });
    setIsSheetOpen(true);
  };

  const onSubmit = (data: ProductForm) => {
    const payload = {
      ...data,
      costPrice: data.costPrice === "" ? undefined : Number(data.costPrice),
      categoryId: data.categoryId === "none" ? undefined : data.categoryId,
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-display font-bold tracking-tight">Products</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Add Product
        </Button>
      </div>

      <div className="flex items-center space-x-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search products..." 
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
              <TableHead>Product Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading products...</TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No products found.</TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
                  <TableCell>{product.categoryName || "—"}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(product.price)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={product.stock > (product.minStock || 0) ? "secondary" : product.stock > 0 ? "warning" : "destructive"}>
                      {product.stock}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{editingProduct ? "Edit Product" : "New Product"}</SheetTitle>
          </SheetHeader>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Product Name</Label>
              <Input {...register("name")} placeholder="e.g. Artisanal Coffee Beans" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>SKU</Label>
              <Input {...register("sku")} className="font-mono" placeholder="COF-ART-01" />
              {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Retail Price ($)</Label>
                <Input type="number" step="0.01" {...register("price")} />
                {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Cost Price ($)</Label>
                <Input type="number" step="0.01" {...register("costPrice")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Current Stock</Label>
                <Input type="number" {...register("stock")} />
              </div>
              <div className="space-y-2">
                <Label>Low Stock Alert At</Label>
                <Input type="number" {...register("minStock")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select onValueChange={(val) => setValue("categoryId", val)} defaultValue={editingProduct?.categoryId || "none"}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {categories?.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SheetFooter className="mt-8 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingProduct ? "Save Changes" : "Create Product"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}