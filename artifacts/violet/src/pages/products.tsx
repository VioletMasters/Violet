import React, { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  useCreateBrand,
  useCreateCategory,
  useCreateProduct,
  useDeleteBrand,
  useDeleteCategory,
  useListBrands,
  useListCategories,
  useListProducts,
  useUpdateBrand,
  useUpdateCategory,
  useUpdateProduct,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Tags, Trash2 } from "lucide-react";
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
  brandId: z.string().optional().or(z.literal("none")),
});

type ProductForm = z.infer<typeof productSchema>;
type CatalogAttribute = { id: string; name: string; productCount?: number };

function CatalogAttributeManager({
  title,
  attributes,
  onCreate,
  onEdit,
  onDelete,
  isSaving,
}: {
  title: string;
  attributes: CatalogAttribute[];
  onCreate: (name: string) => void;
  onEdit: (attribute: CatalogAttribute) => void;
  onDelete: (attribute: CatalogAttribute) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
    setName("");
  };

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <Badge variant="secondary">{attributes.length}</Badge>
      </div>
      <form className="mb-3 flex gap-2" onSubmit={submit}>
        <Input
          aria-label={`New ${title.slice(0, -1).toLowerCase()}`}
          placeholder={`New ${title.slice(0, -1).toLowerCase()}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={isSaving || !name.trim()}>
          Add
        </Button>
      </form>
      {attributes.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>
      ) : (
        <div className="space-y-1">
          {attributes.map((attribute) => {
            const isInUse = (attribute.productCount ?? 0) > 0;
            return (
              <div key={attribute.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-secondary/50">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{attribute.name}</span>
                {isInUse && (
                  <span className="text-xs text-muted-foreground">
                    {attribute.productCount} in use
                  </span>
                )}
                <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(attribute)} aria-label={`Edit ${attribute.name}`}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isInUse}
                  title={isInUse ? "Reassign products before deleting this item" : `Delete ${attribute.name}`}
                  onClick={() => onDelete(attribute)}
                  aria-label={`Delete ${attribute.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCatalogItem, setEditingCatalogItem] = useState<(CatalogAttribute & { kind: "category" | "brand" }) | null>(null);
  const [catalogName, setCatalogName] = useState("");
  
  const queryClient = useQueryClient();
  const { data: productsData, isLoading } = useListProducts({ search });
  const { data: categoriesData } = useListCategories();
  const { data: brandsData } = useListBrands();
  
  const products = productsData?.data || [];
  const categories = categoriesData || [];
  const brands = brandsData || [];

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      stock: 0,
      minStock: 5,
    }
  });

  const refreshCatalog = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/products"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/categories"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/brands"] }),
  ]);

  const createMutation = useCreateProduct({
    mutation: {
      onSuccess: () => {
        toast.success("Product created");
        setIsSheetOpen(false);
        refreshCatalog();
      },
      onError: (e) => toast.error(e.message || "Failed to create product")
    }
  });

  const updateMutation = useUpdateProduct({
    mutation: {
      onSuccess: () => {
        toast.success("Product updated");
        setIsSheetOpen(false);
        refreshCatalog();
      },
      onError: (e) => toast.error(e.message || "Failed to update product")
    }
  });

  const createCategoryMutation = useCreateCategory({
    mutation: {
      onSuccess: () => {
        toast.success("Category added");
        refreshCatalog();
      },
      onError: (error) => toast.error(error.message || "Failed to add category"),
    },
  });
  const updateCategoryMutation = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        toast.success("Category updated");
        setEditingCatalogItem(null);
        refreshCatalog();
      },
      onError: (error) => toast.error(error.message || "Failed to update category"),
    },
  });
  const deleteCategoryMutation = useDeleteCategory({
    mutation: {
      onSuccess: () => {
        toast.success("Category deleted");
        refreshCatalog();
      },
      onError: (error) => toast.error(error.message || "Failed to delete category"),
    },
  });
  const createBrandMutation = useCreateBrand({
    mutation: {
      onSuccess: () => {
        toast.success("Brand added");
        refreshCatalog();
      },
      onError: (error) => toast.error(error.message || "Failed to add brand"),
    },
  });
  const updateBrandMutation = useUpdateBrand({
    mutation: {
      onSuccess: () => {
        toast.success("Brand updated");
        setEditingCatalogItem(null);
        refreshCatalog();
      },
      onError: (error) => toast.error(error.message || "Failed to update brand"),
    },
  });
  const deleteBrandMutation = useDeleteBrand({
    mutation: {
      onSuccess: () => {
        toast.success("Brand deleted");
        refreshCatalog();
      },
      onError: (error) => toast.error(error.message || "Failed to delete brand"),
    },
  });

  const openCreate = () => {
    setEditingProduct(null);
    reset({
      name: "", sku: "", price: 0, costPrice: 0, stock: 0, minStock: 5, categoryId: "none", brandId: "none"
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
      brandId: product.brandId || "none",
    });
    setIsSheetOpen(true);
  };

  const onSubmit = (data: ProductForm) => {
    const payload = {
      ...data,
      costPrice: data.costPrice === "" ? undefined : Number(data.costPrice),
      categoryId: data.categoryId === "none" ? null : data.categoryId,
      brandId: data.brandId === "none" ? null : data.brandId,
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const openCatalogEdit = (kind: "category" | "brand", attribute: CatalogAttribute) => {
    setCatalogName(attribute.name);
    setEditingCatalogItem({ ...attribute, kind });
  };

  const saveCatalogEdit = () => {
    if (!editingCatalogItem || !catalogName.trim()) return;
    if (editingCatalogItem.kind === "category") {
      updateCategoryMutation.mutate({ id: editingCatalogItem.id, data: { name: catalogName.trim() } });
      return;
    }
    updateBrandMutation.mutate({ id: editingCatalogItem.id, data: { name: catalogName.trim() } });
  };

  const deleteCatalogAttribute = (kind: "category" | "brand", attribute: CatalogAttribute) => {
    if ((attribute.productCount ?? 0) > 0) {
      toast.error(`Reassign the ${attribute.productCount} linked product${attribute.productCount === 1 ? "" : "s"} before deleting this ${kind}.`);
      return;
    }
    if (!window.confirm(`Delete ${attribute.name}? This cannot be undone.`)) return;
    if (kind === "category") {
      deleteCategoryMutation.mutate({ id: attribute.id });
      return;
    }
    deleteBrandMutation.mutate({ id: attribute.id });
  };

  const selectedCategoryId = watch("categoryId") || "none";
  const selectedBrandId = watch("brandId") || "none";
  const isCatalogSaving =
    createCategoryMutation.isPending ||
    updateCategoryMutation.isPending ||
    deleteCategoryMutation.isPending ||
    createBrandMutation.isPending ||
    updateBrandMutation.isPending ||
    deleteBrandMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-display font-bold tracking-tight">Products</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Add Product
        </Button>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <Tags className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Catalog organization</h2>
              <p className="text-sm text-muted-foreground">
                Create categories and brands to keep products easy to find. Attributes assigned to products must be reassigned before deletion.
              </p>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <CatalogAttributeManager
              title="Categories"
              attributes={categories}
              isSaving={isCatalogSaving}
              onCreate={(name) => createCategoryMutation.mutate({ data: { name } })}
              onEdit={(attribute) => openCatalogEdit("category", attribute)}
              onDelete={(attribute) => deleteCatalogAttribute("category", attribute)}
            />
            <CatalogAttributeManager
              title="Brands"
              attributes={brands}
              isSaving={isCatalogSaving}
              onCreate={(name) => createBrandMutation.mutate({ data: { name } })}
              onEdit={(attribute) => openCatalogEdit("brand", attribute)}
              onDelete={(attribute) => deleteCatalogAttribute("brand", attribute)}
            />
          </div>
        </CardContent>
      </Card>

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
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Loading products...</TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No products found.</TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
                  <TableCell>{product.categoryName || "—"}</TableCell>
                  <TableCell>{product.brandName || "—"}</TableCell>
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
              <Select value={selectedCategoryId} onValueChange={(val) => setValue("categoryId", val)}>
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

            <div className="space-y-2">
              <Label>Brand</Label>
              <Select value={selectedBrandId} onValueChange={(val) => setValue("brandId", val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Brand</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
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

      <Dialog open={!!editingCatalogItem} onOpenChange={(open) => !open && setEditingCatalogItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editingCatalogItem?.kind === "category" ? "Category" : "Brand"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="catalog-attribute-name">Name</Label>
            <Input
              id="catalog-attribute-name"
              value={catalogName}
              onChange={(event) => setCatalogName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveCatalogEdit();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setEditingCatalogItem(null)}>Cancel</Button>
            <Button type="button" onClick={saveCatalogEdit} disabled={isCatalogSaving || !catalogName.trim()}>
              {isCatalogSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}