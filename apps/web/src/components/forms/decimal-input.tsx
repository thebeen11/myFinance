'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Input } from '@/components/ui/input';
import { applyDecimalKeystroke, formatDecimalInputValue } from '@/lib/decimal-input';
import { cn } from '@/lib/utils';

/**
 * `useLayoutEffect` restores the caret before the browser paints, so a
 * reformatted field never flashes with the cursor in the wrong place. It warns
 * when React renders on the server, and a caret only exists in a browser, so
 * fall back to `useEffect` there. Chosen once at module scope, which keeps hook
 * order stable within any single environment.
 */
const useCaretEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface DecimalInputProps {
  /** The most decimals the field accepts. Anything past it is dropped as typed. */
  fractionDigits: number;
  /**
   * The fewest to show once the field settles, defaulting to `fractionDigits`.
   * Money wants the padding ("1,50"); a quantity wants 0, because a padded
   * "1,500" reads as one thousand five hundred in this locale.
   */
  minFractionDigits?: number;
  /** Rendered inside the field on the left — a currency code, a unit. */
  prefix?: ReactNode;
  /** The number as a human writes it. `undefined` is an empty field, not zero. */
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
 * A number field that reads the way this locale writes numbers: grouped digits,
 * a comma for the decimal, and a fixed precision.
 *
 * Deliberately `type="text"` — a number input cannot render group separators, and
 * a browser whose locale uses a dot rejects "1,5" outright, which is exactly how
 * a weight gets typed here. Validation still happens in the zod schema and again
 * in the API, so nothing rests on the input's own constraints.
 *
 * The formatting rules live in `lib/decimal-input`; this holds only DOM wiring.
 */
export const DecimalInput = ({
  fractionDigits,
  minFractionDigits,
  prefix,
  value,
  onChange,
  onBlur,
  className,
  ...rest
}: DecimalInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() =>
    formatDecimalInputValue(value, fractionDigits, minFractionDigits),
  );
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
    setText(formatDecimalInputValue(value, fractionDigits, minFractionDigits));
  }, [value, fractionDigits, minFractionDigits]);

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

    const next = applyDecimalKeystroke({
      previousText: text,
      rawText,
      caret: event.target.selectionStart ?? rawText.length,
      key,
      fractionDigits,
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

  // Settle the field: on a money field "1,5" becomes "1,50", and everywhere a
  // dangling "1.234," loses its comma. Recomputed from the text rather than the
  // prop, which the parent form may not have flushed back yet.
  const handleBlur = (): void => {
    const settled = applyDecimalKeystroke({
      previousText: text,
      rawText: text,
      caret: text.length,
      key: null,
      fractionDigits,
    });
    setText(formatDecimalInputValue(settled.value, fractionDigits, minFractionDigits));
    onBlur?.();
  };

  return (
    <div className="relative">
      {prefix ? (
        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm">
          {prefix}
        </span>
      ) : null}
      <Input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn('text-right tabular-nums', prefix ? 'pl-13' : undefined, className)}
        value={text}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  );
};
