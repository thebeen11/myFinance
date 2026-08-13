'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { productsRemove } from '@/api';
import type { ProductResponse } from '@/api';
import { ProductDialog } from '@/components/products/product-dialog';
import { PageHeader } from '@/components/shell/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMerchant, useProducts } from '@/hooks/use-finance-queries';
import { money } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

export default function MerchantProductsPage() {
  // Every page here is a client component, so the route param comes from
  // `useParams` — the server `params` object is a promise in this Next version.
  const params = useParams<{ merchantId: string }>();
  const merchantId = params.merchantId;

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ProductResponse | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProductResponse | undefined>(undefined);

  const queryClient = useQueryClient();
  const merchant = useMerchant(merchantId);
  const products = useProducts(merchantId);

  // Filtered in the browser: the list endpoint is unpaginated, so the merchant's
  // whole catalogue is already in cache and a round-trip per keystroke would buy
  // nothing. (The API's `?search=` is still there for other consumers.)
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = products.data ?? [];
    return term
      ? all.filter(
          (product) =>
            product.code?.toLowerCase().includes(term) ||
            product.name.toLowerCase().includes(term),
        )
      : all;
  }, [products.data, search]);

  const removal = useMutation({
    mutationFn: (id: string) => productsRemove({ path: { id }, throwOnError: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.products(merchantId) });
      // The merchants list shows productCount, which just changed.
      await queryClient.invalidateQueries({ queryKey: queryKeys.merchants() });
      toast.success('Product deleted');
      setPendingDelete(undefined);
    },
    onError: () => toast.error('Could not delete the product'),
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link
            href="/merchants"
            className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Merchants
          </Link>
        }
        title={merchant.data?.name ?? 'Products'}
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            Add product
          </Button>
        }
      />

      <div className="relative min-w-0 sm:max-w-xs">
        <Search
          className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4"
          aria-hidden
        />
        <Input
          placeholder="Search products"
          className="pl-10"
          aria-label="Search products"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card className="[--card-spacing:0px] py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Last price</TableHead>
              <TableHead className="w-24 pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.isPending ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={4} className="px-5">
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : products.isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-14 text-center">
                  <p className="text-sm font-medium">Cannot reach the API</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Products could not be loaded.
                  </p>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-14 text-center">
                  <p className="text-sm font-medium">
                    {search ? 'Nothing here' : 'No products yet'}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {search
                      ? 'No product matches that code or name.'
                      : 'Add the things you buy here, along with the price you last paid.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((product) => (
                <TableRow key={product.id} className="hover:bg-muted/50">
                  <TableCell className="text-muted-foreground pl-5 font-mono text-xs">
                    {product.code ?? '—'}
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(product.lastPriceMinor, product.currency)}
                  </TableCell>
                  <TableCell className="pr-5 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${product.name}`}
                      onClick={() => {
                        setEditing(product);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${product.name}`}
                      onClick={() => setPendingDelete(product)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ProductDialog
        merchantId={merchantId}
        product={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <AlertDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.code ? `${pendingDelete.code} — ` : ''}${pendingDelete.name}. This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removal.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removal.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) removal.mutate(pendingDelete.id);
              }}
            >
              {removal.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
