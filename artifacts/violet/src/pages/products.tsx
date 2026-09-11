import React, { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  useCreateBrand,
  useCreateCategory,
  useCreateProduct,
  useDeleteProduct,
  useDeleteBrand,
  useDeleteCategory,
  useListBrands,
  useListCategories,
  useListProducts,
  useUpdateBrand,
  useUpdateCategory,
  useUpdateProduct,
  useImportProducts,
  exportProducts,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Tags, Trash2, Upload, FileSpreadsheet, Download, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { Product } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { calculateRetailPrice, isValidMarkupPercentage } from "@/lib/product-pricing";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  price: z.coerce.number().min(0, "Price must be >= 0"),
  costPrice: z.coerce.number().min(0).optional().or(z.literal("")),
  stock: z.coerce.number().int().min(0),
  minStock: z.coerce.number().int().min(0),
  categoryId: z.string().optional().or(z.literal("none")),
  brandId: z.string().optional().or(z.literal("none")),
  printDestination: z.string().default("customer_receipt"),
  warehouseLocation: z.string().optional().or(z.literal("")),
});

type ProductForm = z.infer<typeof productSchema>;
type CatalogAttribute = { id: string; name: string; productCount?: number; printDestination?: string };
type ProductImportRow = {
  name: string;
  description?: string;
  sku: string;
  barcode?: string;
  price: number;
  costPrice?: number;
  stock?: number;
  minStock?: number;
  category?: string;
  brand?: string;
};

const importAliases: Record<keyof ProductImportRow, string[]> = {
  name: ["name", "product", "productname", "item", "itemname", "description"],
  description: ["details", "productdescription", "description"],
  sku: ["sku", "code", "itemcode", "productcode", "reference", "ref"],
  barcode: ["barcode", "ean", "ean13", "upc", "gtin"],
  price: ["price", "saleprice", "sellingprice", "retailprice", "selling"],
  costPrice: ["cost", "costprice", "purchaseprice", "buyprice"],
  stock: ["stock", "quantity", "qty", "onhand", "inventory"],
  minStock: ["minstock", "minimumstock", "reorderlevel", "lowstock"],
  category: ["category", "categoryname", "department", "group"],
  brand: ["brand", "brandname", "manufacturer"],
};

function normalizeImportHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseImportNumber(value: string, fallback?: number) {
  const normalized = value.trim();
  if (!normalized) return fallback;
  const localized = normalized.includes(",") && normalized.includes(".") && normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized.replace(/,/g, ".");
  const parsed = Number(localized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDelimitedCsv(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiterCounts = [",", ";", "\t"].map((candidate) => ({
    candidate,
    count: firstLine.split(candidate).length - 1,
  }));
  const delimiter = delimiterCounts.sort((left, right) => right.count - left.count)[0]?.candidate || ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function parseProductImport(text: string) {
  const rows = parseDelimitedCsv(text);
  const headers = rows.shift()?.map(normalizeImportHeader) ?? [];
  const columnIndex = (field: keyof ProductImportRow) => {
    const aliases = importAliases[field];
    return headers.findIndex((header) => aliases.includes(header));
  };
  const indexByField = Object.fromEntries(
    (Object.keys(importAliases) as Array<keyof ProductImportRow>).map((field) => [field, columnIndex(field)]),
  ) as Record<keyof ProductImportRow, number>;
  const errors: string[] = [];
  if (indexByField.name < 0) errors.push("Could not find a product name column.");
  if (indexByField.sku < 0) errors.push("Could not find an SKU, code, or reference column.");
  if (indexByField.price < 0) errors.push("Could not find a price column.");

  const parsedRows: ProductImportRow[] = [];
  rows.forEach((cells, rowIndex) => {
    const value = (field: keyof ProductImportRow) => {
      const index = indexByField[field];
      return index >= 0 ? (cells[index] ?? "").trim() : "";
    };
    const price = parseImportNumber(value("price"));
    const rowNumber = rowIndex + 2;
    if (!value("name") || !value("sku") || price === undefined) {
      errors.push(`Row ${rowNumber}: name, SKU, and a numeric price are required.`);
      return;
    }
    const stock = parseImportNumber(value("stock"), 0);
    const minStock = parseImportNumber(value("minStock"), 5);
    const costPrice = parseImportNumber(value("costPrice"));
    if (stock === undefined || minStock === undefined || costPrice === undefined && value("costPrice")) {
      errors.push(`Row ${rowNumber}: stock, minimum stock, and cost must be numeric when provided.`);
      return;
    }
    parsedRows.push({
      name: value("name"),
      description: value("description") || undefined,
      sku: value("sku"),
      barcode: value("barcode") || undefined,
      price,
      costPrice,
      stock,
      minStock,
      category: value("category") || undefined,
      brand: value("brand") || undefined,
    });
  });
  return { rows: parsedRows, errors };
}

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
        <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain pr-1">
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
  const [productPendingDeletion, setProductPendingDeletion] = useState<Product | null>(null);
  const [editingCatalogItem, setEditingCatalogItem] = useState<(CatalogAttribute & { kind: "category" | "brand" }) | null>(null);
  const [catalogName, setCatalogName] = useState("");
  const [catalogPrintDestination, setCatalogPrintDestination] = useState("customer_receipt");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<ProductImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [priceMode, setPriceMode] = useState<"manual" | "markup">("manual");
  const [markupPercentage, setMarkupPercentage] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  
  const queryClient = useQueryClient();
  const { data: productsData, isLoading } = useListProducts({ search });
  const { data: categoriesData } = useListCategories();
  const { data: brandsData } = useListBrands();
  
  const products = productsData?.data || [];
  const categories = categoriesData || [];
  const brands = brandsData || [];

  const importMutation = useImportProducts({
    mutation: {
      onSuccess: (result) => {
        setImportResult(result);
        toast.success(`Import complete: ${result.created} created, ${result.updated} updated`);
        refreshCatalog();
      },
      onError: (error) => toast.error(error.message || "Import failed"),
    },
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      stock: 0,
      minStock: 5,
    }
  });
  const watchedCostPrice = watch("costPrice");

  const markupValue = Number(markupPercentage);
  const markupError =
    priceMode === "markup" && (
      !isValidMarkupPercentage(markupPercentage)
    );

  useEffect(() => {
    if (priceMode !== "markup" || markupError) return;
    const costPrice = Number(watchedCostPrice);
    const calculatedPrice = calculateRetailPrice(costPrice, markupValue);
    if (calculatedPrice === null) return;
    setValue("price", calculatedPrice, { shouldDirty: true, shouldValidate: true });
  }, [editingProduct, markupError, markupValue, priceMode, setValue, watchedCostPrice]);

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

  const deleteProductMutation = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        toast.success("Product deleted");
        setProductPendingDeletion(null);
        refreshCatalog();
      },
      onError: (error) => toast.error(error.message || "Failed to delete product"),
    },
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
    setPriceMode("manual");
    setMarkupPercentage("");
    reset({
      name: "", sku: "", price: 0, costPrice: 0, stock: 0, minStock: 5, categoryId: "none", brandId: "none"
      , printDestination: "customer_receipt", warehouseLocation: ""
    });
    setIsSheetOpen(true);
  };

  const openImport = () => {
    setImportFileName("");
    setImportRows([]);
    setImportErrors([]);
    setImportResult(null);
    setIsImportOpen(true);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const parsed = parseProductImport(await file.text());
    setImportFileName(file.name);
    setImportRows(parsed.rows);
    setImportErrors(parsed.errors);
    setImportResult(null);
  };

  const downloadImportTemplate = () => {
    const blob = new Blob(["Name,SKU,Barcode,Price,Cost Price,Stock,Minimum Stock,Category,Brand,Description\nExample Product,SKU-001,123456789,9.99,5.00,10,5,General,Example Brand,Optional product details\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "violet-product-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadProducts = async () => {
    setIsExporting(true);
    try {
      const csv = await exportProducts({ responseType: "text" });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "violet-products.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${productsData?.total ?? 0} products`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download products");
    } finally {
      setIsExporting(false);
    }
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setPriceMode("manual");
    setMarkupPercentage("");
    reset({
      name: product.name,
      sku: product.sku,
      price: product.price,
      costPrice: product.costPrice || 0,
      stock: product.stock,
      minStock: product.minStock || 0,
      categoryId: product.categoryId || "none",
      brandId: product.brandId || "none",
      printDestination: product.printDestination || "customer_receipt",
      warehouseLocation: product.warehouseLocation || "",
    });
    setIsSheetOpen(true);
  };

  const onSubmit = (data: ProductForm) => {
    if (markupError) {
      toast.error("Enter a markup percentage from 0% to 100%.");
      return;
    }
    const payload = {
      ...data,
      costPrice: data.costPrice === "" ? undefined : Number(data.costPrice),
      categoryId: data.categoryId === "none" ? null : data.categoryId,
      brandId: data.brandId === "none" ? null : data.brandId,
      warehouseLocation: data.warehouseLocation || null,
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const openCatalogEdit = (kind: "category" | "brand", attribute: CatalogAttribute) => {
    setCatalogName(attribute.name);
    setCatalogPrintDestination(attribute.printDestination || "customer_receipt");
    setEditingCatalogItem({ ...attribute, kind });
  };

  const saveCatalogEdit = () => {
    if (!editingCatalogItem || !catalogName.trim()) return;
    if (editingCatalogItem.kind === "category") {
      updateCategoryMutation.mutate({
        id: editingCatalogItem.id,
        data: { name: catalogName.trim(), printDestination: catalogPrintDestination },
      });
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadProducts} disabled={isExporting} className="gap-2" title="Download the complete product catalog">
            <Download className="w-4 h-4" /> {isExporting ? "Preparing..." : "Download CSV"}
          </Button>
          <Button variant="outline" onClick={openImport} className="gap-2">
            <Upload className="w-4 h-4" /> Import CSV
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        </div>
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

      <div className="max-h-[32rem] overflow-auto rounded-xl border bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
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
                     <div className="flex justify-end gap-1">
                       <Button
                         variant="ghost"
                         size="icon"
                         onClick={() => openEdit(product)}
                         aria-label={`Edit ${product.name}`}
                         title="Edit product"
                       >
                         <Edit className="w-4 h-4" />
                       </Button>
                       <Button
                         variant="ghost"
                         size="icon"
                         className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                         onClick={() => setProductPendingDeletion(product)}
                         aria-label={`Delete ${product.name}`}
                         title="Delete product"
                       >
                         <Trash2 className="w-4 h-4" />
                       </Button>
                     </div>
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
                 <Label>{priceMode === "markup" ? "Calculated Retail Price ($)" : "Retail Price ($)"}</Label>
                <Input
                  type="number"
                  step="0.01"
                   readOnly={priceMode === "markup"}
                  {...register("price")}
                />
                {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Cost Price ($)</Label>
                <Input type="number" step="0.01" {...register("costPrice")} />
              </div>
            </div>

             <div className="space-y-3 rounded-md border bg-muted/30 p-3">
               <div className="space-y-2">
                 <Label>Retail price method</Label>
                 <Select
                   value={priceMode}
                   onValueChange={(value) => {
                     const nextMode = value as "manual" | "markup";
                     setPriceMode(nextMode);
                     if (nextMode === "markup") {
                       const costPrice = Number(watchedCostPrice);
                       setValue("price", Number.isFinite(costPrice) ? costPrice : 0, { shouldValidate: true });
                     }
                   }}
                 >
                   <SelectTrigger>
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="manual">Enter retail price manually</SelectItem>
                     <SelectItem value="markup">Calculate from cost and markup</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               {priceMode === "markup" && (
                 <div className="space-y-2">
                   <Label htmlFor="markup-percentage">Markup percentage</Label>
                   <div className="relative">
                     <Input
                       id="markup-percentage"
                       type="number"
                       min="0"
                       max="100"
                       step="0.1"
                       value={markupPercentage}
                       onChange={(event) => setMarkupPercentage(event.target.value)}
                       placeholder="e.g. 25"
                       className="pr-8"
                     />
                     <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                   </div>
                   {markupError ? (
                     <p className="text-xs text-destructive">Enter a markup between 0% and 100%.</p>
                   ) : (
                     <p className="text-xs text-muted-foreground">
                       Retail price = cost × (1 + markup). The price above updates automatically.
                     </p>
                   )}
                 </div>
               )}
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

            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <Label>Print destination</Label>
              <Select value={watch("printDestination")} onValueChange={(value) => setValue("printDestination", value, { shouldDirty: true })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_receipt">Customer receipt</SelectItem>
                  <SelectItem value="warehouse">Warehouse ticket</SelectItem>
                  <SelectItem value="kitchen">Kitchen ticket</SelectItem>
                  <SelectItem value="packing">Packing ticket</SelectItem>
                  <SelectItem value="office">Office ticket</SelectItem>
                  <SelectItem value="custom">Custom ticket</SelectItem>
                  <SelectItem value="none">No automatic ticket</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Specific products override their category destination.</p>
              {watch("printDestination") !== "customer_receipt" && watch("printDestination") !== "none" && (
                <Input {...register("warehouseLocation")} placeholder="Pick location, e.g. Aisle 4 / Chiller" />
              )}
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

      <AlertDialog
        open={!!productPendingDeletion}
        onOpenChange={(open) => !open && setProductPendingDeletion(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{productPendingDeletion?.name}</span>
              {" "}from your catalog. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProductMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProductMutation.isPending}
              onClick={() => {
                if (productPendingDeletion) {
                  deleteProductMutation.mutate({ id: productPendingDeletion.id });
                }
              }}
            >
              {deleteProductMutation.isPending ? "Deleting..." : "Delete product"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import products from CSV</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Import common exports from Aronium and other POS systems. Violet matches existing products by SKU first, then barcode, and updates them instead of creating duplicates.
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <input ref={importFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
              <Button type="button" onClick={() => importFileRef.current?.click()} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Choose CSV file
              </Button>
              <Button type="button" variant="outline" onClick={downloadImportTemplate} className="gap-2">
                <Download className="h-4 w-4" /> Download template
              </Button>
              {importFileName && <span className="self-center text-sm text-muted-foreground">{importFileName}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Recognized columns include product/name, SKU/code/reference, barcode/EAN/UPC, price, cost, stock/quantity, category, and brand. Comma-, semicolon-, and tab-separated files are supported.
            </p>
            {importErrors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <p className="mb-1 font-medium">{importErrors.length} issue{importErrors.length === 1 ? "" : "s"} found</p>
                <ul className="max-h-28 list-disc space-y-1 overflow-y-auto pl-5">
                  {importErrors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}
            {importRows.length > 0 && (
              <div className="rounded-md border">
                <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
                  <span className="font-medium">{importRows.length} products ready to import</span>
                  <span className="text-muted-foreground">Previewing first {Math.min(importRows.length, 5)}</span>
                </div>
                <div className="max-h-56 overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Price</TableHead><TableHead>Stock</TableHead><TableHead>Category</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {importRows.slice(0, 5).map((row) => (
                        <TableRow key={`${row.sku}-${row.name}`}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                          <TableCell>{row.price}</TableCell>
                          <TableCell>{row.stock ?? 0}</TableCell>
                          <TableCell>{row.category || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {importResult && (
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <span>Imported successfully: {importResult.created} created, {importResult.updated} updated, {importResult.skipped} skipped.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsImportOpen(false)}>Close</Button>
            <Button
              type="button"
              disabled={importRows.length === 0 || importErrors.length > 0 || importMutation.isPending}
              onClick={() => importMutation.mutate({ data: { rows: importRows } })}
            >
              {importMutation.isPending ? "Importing..." : `Import ${importRows.length || ""} products`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {editingCatalogItem?.kind === "category" && (
              <div className="space-y-2">
                <Label>Default print destination</Label>
                <Select value={catalogPrintDestination} onValueChange={setCatalogPrintDestination}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer_receipt">Customer receipt only</SelectItem>
                    <SelectItem value="warehouse">Warehouse ticket</SelectItem>
                    <SelectItem value="kitchen">Kitchen ticket</SelectItem>
                    <SelectItem value="packing">Packing ticket</SelectItem>
                    <SelectItem value="office">Office ticket</SelectItem>
                    <SelectItem value="custom">Custom ticket</SelectItem>
                    <SelectItem value="none">No automatic ticket</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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