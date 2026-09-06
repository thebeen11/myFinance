'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

import { merchantsCreate } from '@/api';
import type { MerchantResponse } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { queryKeys } from '@/lib/query-keys';

/** A SelectItem value cannot be `''`, so "no merchant" needs a sentinel. */
export const NO_MERCHANT = '__none__';

/** The API's own limit, so an over-long name is refused here rather than at the wire. */
const MAX_NAME_LENGTH = 120;

interface MerchantFieldProps {
  id: string;
  /** A merchant id, or `NO_MERCHANT`. */
  value: string;
  onChange: (value: string) => void;
  merchants: MerchantResponse[];
  /**
   * Seeds the inline add field — the name a scan read but could not match.
   * Omit where nothing was scanned.
   */
  suggestedName?: string | null;
  disabled?: boolean;
}

/**
 * Picks a merchant, and can create one without leaving the form.
 *
 * The picker is shared by the receipt draft and the transaction dialog, which is
 * why the sentinel lives here rather than being redeclared in both. The inline
 * add exists for the scan: a receipt from an unknown shop is exactly the moment
 * the merchant is worth creating, and sending the reviewer to the Merchants page
 * would throw the draft — and the photo — away.
 *
 * An inline field rather than a nested dialog, so the draft behind it stays
 * readable while the name is corrected: a receipt header is often noisier than
 * the name worth keeping ("PT INDOMARCO PRISMATAMA — CABANG DEPOK").
 *
 * Creating a merchant here does not re-run the scan's product matching, which
 * only reads the catalogue of an already-matched merchant. Nothing is lost: a
 * merchant created this second has no catalogue to match against.
 */
export const MerchantField = ({
  id,
  value,
  onChange,
  merchants,
  suggestedName,
  disabled,
}: MerchantFieldProps) => {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<MerchantResponse | null>(null);

  // The list is refetched before the new id is selected, but the merge makes that
  // ordering irrelevant: a Select whose value is not among its items renders blank.
  const options =
    created && !merchants.some((merchant) => merchant.id === created.id)
      ? [...merchants, created].sort((a, b) => a.name.localeCompare(b.name))
      : merchants;

  const mutation = useMutation({
    mutationFn: async (merchantName: string) => {
      const { data } = await merchantsCreate({
        body: { name: merchantName },
        throwOnError: true,
      });

      return data;
    },
    onSuccess: async (merchant) => {
      // Only the merchants prefix: unlike a rename, a new merchant cannot change
      // the name any existing transaction row already embeds.
      await queryClient.invalidateQueries({ queryKey: queryKeys.merchants() });
      setCreated(merchant);
      onChange(merchant.id);
      setIsAdding(false);
      setName('');
      toast.success(`${merchant.name} added to your merchants`);
    },
    onError: (error: unknown) => {
      // A name this user already has comes back as a 409 and lands here; the field
      // stays open so it can be corrected rather than retyped.
      toast.error(error instanceof Error ? error.message : 'Could not add the merchant');
    },
  });

  const handleOpenAdd = (): void => {
    setName(suggestedName ?? '');
    setIsAdding(true);
  };

  const handleCreate = (): void => {
    const trimmed = name.trim();

    if (!trimmed || mutation.isPending) return;

    mutation.mutate(trimmed);
  };

  const handleCancel = (): void => {
    setIsAdding(false);
    setName('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      // This field lives inside a form; Enter must add the merchant, not save the
      // transaction the user is still filling in.
      event.preventDefault();
      handleCreate();
      return;
    }

    if (event.key === 'Escape') {
      // The dialog closes on Escape too; this field is the inner layer and goes first.
      event.stopPropagation();
      handleCancel();
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={id} className="w-full flex-1">
            <SelectValue placeholder="No merchant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MERCHANT}>No merchant</SelectItem>
            {options.map((merchant) => (
              <SelectItem key={merchant.id} value={merchant.id}>
                {merchant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isAdding ? null : (
          <Button type="button" variant="outline" onClick={handleOpenAdd} disabled={disabled}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        )}
      </div>

      {isAdding ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            aria-label="New merchant name"
            autoComplete="off"
            placeholder="Indomaret"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={mutation.isPending}
          />
          <Button
            type="button"
            onClick={handleCreate}
            disabled={mutation.isPending || name.trim().length === 0}
          >
            {mutation.isPending ? 'Adding…' : 'Add'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancel adding a merchant"
            onClick={handleCancel}
            disabled={mutation.isPending}
          >
            <X />
          </Button>
        </div>
      ) : null}
    </div>
  );
};
