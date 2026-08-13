'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_CURRENCY, fromMinor, toMinor } from '@myfinance/shared';
import { useEffect, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { productsCreate, productsUpdate } from '@/api';
import type { ProductResponse } from '@/api';
import { CurrencyInput } from '@/components/forms/currency-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategories } from '@/hooks/use-finance-queries';
import { categoriesOfKind } from '@/lib/category-selection';
import { queryKeys } from '@/lib/query-keys';

const schema = z.object({
  // Optional: plenty of things you buy carry no printed SKU. Blank is sent as
  // '' rather than omitted, which is how the API is told to clear an old code.
  code: z.string().max(40, 'Use 40 characters or fewer'),
  name: z.string().min(1, 'Give the product a name').max(160),
  // Required by the API. It is the default a receipt line inherits, not a binding
  // one — a line may be re-categorised without touching the product.
  categoryId: z.string().uuid('Pick a category'),
  // Major units as typed by a human; converted to minor units on submit.
  // `undefined` is an empty field — the union lets the form hold that state and
  // the refinement turns it into a message instead of a type error.
  lastPrice: z
    .union([z.number(), z.undefined()])
    .refine((value): value is number => value !== undefined, 'Enter a price')
    .refine((value) => value >= 0, 'Price cannot be negative'),
});

type FormValues = z.input<typeof schema>;

interface ProductDialogProps {
  merchantId: string;
  /** Present when editing; omit to create. */
  product?: ProductResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
}

export const ProductDialog = ({
  merchantId,
  product,
  open,
  onOpenChange,
  trigger,
}: ProductDialogProps) => {
  const queryClient = useQueryClient();

  // Products are things you buy, so only expense categories apply.
  const categories = useCategories();
  const selectableCategories = categoriesOfKind(categories.data ?? [], 'EXPENSE');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', categoryId: '', lastPrice: undefined },
  });

  // Re-seed the form whenever the dialog opens on a different row.
  useEffect(() => {
    if (!open) return;
    form.reset({
      code: product?.code ?? '',
      name: product?.name ?? '',
      categoryId: product?.category?.id ?? '',
      // Read the currency the API returned rather than assuming IDR, so an
      // existing row is always scaled back by the same rule it was stored under.
      lastPrice: product ? fromMinor(product.lastPriceMinor, product.currency) : undefined,
    });
  }, [open, product, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = schema.parse(values);
      const body = {
        merchantId,
        categoryId: parsed.categoryId,
        code: parsed.code.trim(),
        name: parsed.name,
        lastPriceMinor: toMinor(parsed.lastPrice, DEFAULT_CURRENCY),
      };

      return product
        ? productsUpdate({ path: { id: product.id }, body, throwOnError: true })
        : productsCreate({ body, throwOnError: true });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.products(merchantId) });
      // Creating one changes MerchantResponse.productCount, which the merchants
      // list renders — that key sits outside the products key, so invalidate it.
      if (!product) await queryClient.invalidateQueries({ queryKey: queryKeys.merchants() });
      toast.success(product ? 'Product updated' : 'Product added');
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      // A code already used by this merchant comes back as a 409 and lands here.
      toast.error(error instanceof Error ? error.message : 'Could not save the product');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit product' : 'Add product'}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="grid gap-2">
            <Label htmlFor="code">Code</Label>
            <Input id="code" placeholder="IDM-001" autoComplete="off" {...form.register('code')} />
            {form.formState.errors.code ? (
              <p className="text-destructive text-xs">{form.formState.errors.code.message}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Optional. The shop&rsquo;s own code, if it prints one.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Indomie Goreng"
              autoComplete="off"
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="categoryId">Category</Label>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                // A Select value cannot be `''`, so the empty state is signalled by
                // passing undefined and letting the placeholder show.
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger id="categoryId" className="w-full">
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: category.color ?? 'var(--muted-foreground)' }}
                          aria-hidden
                        />
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.categoryId ? (
              <p className="text-destructive text-xs">{form.formState.errors.categoryId.message}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lastPrice">Last price</Label>
            <Controller
              control={form.control}
              name="lastPrice"
              render={({ field }) => (
                <CurrencyInput
                  id="lastPrice"
                  currency={DEFAULT_CURRENCY}
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            {form.formState.errors.lastPrice ? (
              <p className="text-destructive text-xs">{form.formState.errors.lastPrice.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
