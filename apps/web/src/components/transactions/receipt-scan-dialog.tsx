'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { receiptsCreate, receiptsScan } from '@/api';
import type {
  AccountResponse,
  CreateReceiptDto,
  MerchantResponse,
  ReceiptDraftResponse,
} from '@/api';
import { ReceiptDraftReview } from '@/components/transactions/receipt-draft-review';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategories } from '@/hooks/use-finance-queries';
import { prepareReceiptImage } from '@/lib/receipt-image';

/**
 * Photograph a receipt, correct what was read, save it.
 *
 * Three states rather than one form, because the middle one is not instant: a
 * vision call on a full receipt takes seconds, and a spinner with no context
 * reads as a hang. The photo stays on screen while it is being read so it is
 * obvious what the wait is for.
 *
 * The account is chosen **before** the photo, not after. It owns the currency,
 * and the API needs it to know whether "12.500" is twelve and a half thousand
 * rupiah or a hundred and twenty-five dollars — so it is a question with a right
 * answer, asked once, rather than a scale guessed after the fact.
 */
interface ReceiptScanDialogProps {
  accounts: AccountResponse[];
  merchants: MerchantResponse[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
}

export const ReceiptScanDialog = ({
  accounts,
  merchants,
  open,
  onOpenChange,
  trigger,
}: ReceiptScanDialogProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraftResponse | null>(null);

  // An object URL is a document-lifetime reference; without this every scan
  // leaks the photo it displayed.
  useEffect(() => {
    if (!previewUrl) return;

    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  /**
   * Clearing on the way out rather than in an effect keyed on `open`: the reset
   * belongs to the act of closing, and doing it in an effect is the cascading
   * render the React Compiler lint rule refuses.
   */
  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      setDraft(null);
      setPreviewUrl(null);
    }

    onOpenChange(next);
  };

  const scan = useMutation({
    mutationFn: async (file: File): Promise<ReceiptDraftResponse> => {
      const image = await prepareReceiptImage(file);
      const { data } = await receiptsScan({
        body: { accountId, ...image },
        throwOnError: true,
      });

      return data;
    },
    onSuccess: (data) => setDraft(data),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : 'Could not read that receipt.'),
  });

  const create = useMutation({
    mutationFn: async (dto: CreateReceiptDto) => {
      const { data } = await receiptsCreate({ body: dto, throwOnError: true });

      return data;
    },
    onSuccess: async (transaction) => {
      // The broad prefixes, so the list, the summaries and the charts all follow.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Receipt saved');
      handleOpenChange(false);
      router.push(`/transactions/${transaction.id}`);
    },
    onError: () => toast.error('Could not save the receipt.'),
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];

    // Reset first: picking the same file twice must fire a second change event.
    event.target.value = '';

    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    scan.mutate(file);
  };

  const account = accounts.find((candidate) => candidate.id === accountId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{draft ? 'Check the receipt' : 'Scan a receipt'}</DialogTitle>
        </DialogHeader>

        {draft ? (
          <ReceiptDraftReview
            draft={draft}
            merchants={merchants}
            categories={categories.data ?? []}
            isSubmitting={create.isPending}
            onBack={() => {
              setDraft(null);
              setPreviewUrl(null);
            }}
            onConfirm={(dto) => create.mutate(dto)}
          />
        ) : (
          <DialogBody className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="scan-account">Paid from</Label>
              <Select
                value={accountId || undefined}
                onValueChange={setAccountId}
                disabled={scan.isPending}
              >
                <SelectTrigger id="scan-account">
                  <SelectValue placeholder="Pick an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name} · {candidate.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                The account sets the currency every amount is read into.
              </p>
            </div>

            {previewUrl ? (
              // A blob: URL straight from the camera, not a remote asset —
              // next/image would want a loader and an origin for it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="The receipt being read"
                className="bg-muted max-h-64 w-full rounded-lg object-contain"
              />
            ) : null}

            {scan.isPending ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Reading the receipt — this takes a few seconds.
              </div>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  // Opens the camera directly on a phone, which is where a receipt
                  // is photographed; desktop still gets a file picker.
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  disabled={!account}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera data-icon="inline-start" />
                  {previewUrl ? 'Try another photo' : 'Take or choose a photo'}
                </Button>
              </>
            )}
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
};
