'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { productsCreate, transactionItemsUpdate } from '@/api';
import type { TransactionItemResponse, TransactionResponse } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { queryKeys } from '@/lib/query-keys';

const schema = z.object({
  code: z.string().max(40, 'Use 40 characters or fewer'),
});

type FormValues = z.input<typeof schema>;

interface SaveToCatalogueDialogProps {
  transaction: TransactionResponse;
  item: TransactionItemResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Promotes a hand-typed line into the merchant's catalogue.
 *
 * The code is offered here, at the moment the line becomes master data, and may
 * be skipped — a line was typed by hand precisely because the shop had nothing
 * to scan. Name, price and category come from the line, which is what was
 * actually paid.
 *
 * This is two calls rather than one endpoint, reusing `POST /products`. They are
 * not atomic: if the link fails the product still exists, so the error says so
 * rather than implying nothing happened.
 */
export const SaveToCatalogueDialog = ({
  transaction,
  item,
  open,
  onOpenChange,
}: SaveToCatalogueDialogProps) => {
  const queryClient = useQueryClient();
  const merchantId = transaction.merchant?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ code: '' });
  }, [open, item, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { code } = schema.parse(values);

      if (!merchantId || !item.category) {
        throw new Error('This line needs a merchant and a category before it can be saved.');
      }

      const created = await productsCreate({
        body: {
          merchantId,
          categoryId: item.category.id,
          code: code.trim(),
          name: item.name,
          lastPriceMinor: item.unitPriceMinor,
        },
        throwOnError: true,
      });

      try {
        await transactionItemsUpdate({
          path: { transactionId: transaction.id, itemId: item.id },
          body: { productId: created.data.id },
          throwOnError: true,
        });
      } catch {
        throw new Error(
          `"${item.name}" was added to the catalogue, but this line could not be linked to it. Edit the line to pick it.`,
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.merchants() });
      if (merchantId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.products(merchantId) });
      }
      toast.success(`"${item.name}" added to ${transaction.merchant?.name ?? 'the catalogue'}`);
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      // A code already used by this merchant comes back as a 409 and lands here.
      toast.error(error instanceof Error ? error.message : 'Could not save to the catalogue');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save to the catalogue</DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <DialogBody className="space-y-4">
            <div className="bg-muted grid gap-1 rounded-xl px-4 py-3 text-sm">
              <span className="font-medium">{item.name}</span>
              <span className="text-muted-foreground">
                {transaction.merchant?.name}
                {item.category ? ` · ${item.category.name}` : null}
              </span>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="code">Product code</Label>
              <Input
                id="code"
                placeholder="IDM-001"
                autoComplete="off"
                {...form.register('code')}
              />
              {form.formState.errors.code ? (
                <p className="text-destructive text-xs">{form.formState.errors.code.message}</p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Optional. The shop&rsquo;s own code for this, unique within this merchant.
                </p>
              )}
            </div>
          </DialogBody>
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
