'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { merchantsCreate, merchantsUpdate } from '@/api';
import type { MerchantResponse } from '@/api';
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

const schema = z.object({
  name: z.string().min(1, 'Give the merchant a name').max(120),
});

type FormValues = z.input<typeof schema>;

interface MerchantDialogProps {
  /** Present when editing; omit to create. */
  merchant?: MerchantResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
}

export const MerchantDialog = ({
  merchant,
  open,
  onOpenChange,
  trigger,
}: MerchantDialogProps) => {
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  // Re-seed the form whenever the dialog opens on a different row.
  useEffect(() => {
    if (!open) return;
    form.reset({ name: merchant?.name ?? '' });
  }, [open, merchant, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = schema.parse(values);

      return merchant
        ? merchantsUpdate({ path: { id: merchant.id }, body, throwOnError: true })
        : merchantsCreate({ body, throwOnError: true });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['merchants'] });
      // Transaction rows embed the merchant name, so a rename has to reach them too.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(merchant ? 'Merchant updated' : 'Merchant added');
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      // A duplicate name comes back as a 409 and lands here.
      toast.error(error instanceof Error ? error.message : 'Could not save the merchant');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{merchant ? 'Edit merchant' : 'Add merchant'}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Indomaret" autoComplete="off" {...form.register('name')} />
            {form.formState.errors.name ? (
              <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>
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
