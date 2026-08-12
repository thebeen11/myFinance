'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';

import { Input } from '@/components/ui/input';
import { applyMoneyKeystroke, formatMoneyInputValue } from '@/lib/money-input';
import { cn } from '@/lib/utils';

/**
 * `useLayoutEffect` restores the caret before the browser paints, so a
 * reformatted field never flashes with the cursor in the wrong place. It warns
 * when React renders on the server, and a caret only exists in a browser, so
 * fall back to `useEffect` there. Chosen once at module scope, which keeps hook
 * order stable within any single environment.
 */
const useCaretEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface CurrencyInputProps {
  /** ISO 4217 code. Drives both the prefix and the number of decimals accepted. */
  currency: string;
  /** Major units. `undefined` is an empty field, not zero. */
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  onBlur?: () => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * A money field that reads the way money is written: grouped digits, the
 * currency's own precision, and the currency code beside it.
 *
 * Deliberately `type="text"` — a number input cannot render group separators,
 * and browsers reject "1.234" as a value. Validation still happens in the zod
 * schema and again in the API, so nothing rests on the input's own constraints.
 *
 * The formatting rules live in `lib/money-input`; this holds only DOM wiring.
 */
export const CurrencyInput = ({
  currency,
  value,
  onChange,
  onBlur,
  className,
  ...rest
}: CurrencyInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => formatMoneyInputValue(value, currency));
  const caretRef = useRef<number | null>(null);
  // A change event cannot tell a backspace from a forward delete, so remember
  // which key opened the edit.
  const lastKeyRef = useRef<string | null>(null);

  // Re-seed from the outside — a form reset, or an account whose currency has a
  // different precision. Skipped while the field has focus, where the text the
  // user is part-way through typing is the truth and this would fight it.
  useEffect(() => {
    const input = inputRef.current;
    if (input !== null && document.activeElement === input) return;
    setText(formatMoneyInputValue(value, currency));
  }, [value, currency]);

  useCaretEffect(() => {
    const caret = caretRef.current;
    if (caret === null) return;
    caretRef.current = null;
    inputRef.current?.setSelectionRange(caret, caret);
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    lastKeyRef.current = event.key;
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const rawText = event.target.value;
    const key = lastKeyRef.current;
    lastKeyRef.current = null;

    const next = applyMoneyKeystroke({
      previousText: text,
      rawText,
      caret: event.target.selectionStart ?? rawText.length,
      key,
      currency,
    });

    onChange(next.value);

    if (next.text === text) {
      // Identical state skips the re-render, so the caret effect never fires —
      // and React still rewrites the DOM value to match, which parks the cursor
      // at the end. Put it back once that has happened.
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.caret, next.caret));
      return;
    }

    setText(next.text);
    caretRef.current = next.caret;
  };

  // Settle the field: "1,5" becomes "1,50", "1.234," loses its dangling comma.
  // Recomputed from the text rather than the prop, which the parent form may not
  // have flushed back yet.
  const handleBlur = (): void => {
    const settled = applyMoneyKeystroke({
      previousText: text,
      rawText: text,
      caret: text.length,
      key: null,
      currency,
    });
    setText(formatMoneyInputValue(settled.value, currency));
    onBlur?.();
  };

  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm">
        {currency}
      </span>
      <Input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn('pl-13 text-right tabular-nums', className)}
        value={text}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  );
};
