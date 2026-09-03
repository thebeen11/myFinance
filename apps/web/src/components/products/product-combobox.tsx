'use client';

import { useId, useMemo, useState, type KeyboardEvent } from 'react';

import type { ProductResponse } from '@/api';
import { Input } from '@/components/ui/input';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Matches the API's own `search`, which is an OR over code and name. */
const matches = (product: ProductResponse, term: string): boolean =>
  product.name.toLowerCase().includes(term) ||
  (product.code?.toLowerCase().includes(term) ?? false);

export interface ProductComboboxProps {
  id?: string;
  /** The typed line name. */
  value: string;
  /** Keystrokes only — never a pick, so the call site can drop the link on it. */
  onValueChange: (name: string) => void;
  onSelectProduct: (product: ProductResponse) => void;
  /** Already narrowed to one merchant and to categories this receipt can use. */
  products: ProductResponse[];
  placeholder?: string;
  onBlur?: () => void;
  'aria-invalid'?: boolean;
}

/**
 * Names a line, and searches the merchant's catalogue while you do it.
 *
 * One control rather than a dropdown above a text field, because they are one
 * idea: what was bought. Picking a suggestion fills the line in from the
 * catalogue; ignoring it leaves exactly what was typed, which is what a shop
 * with nothing to scan needs.
 *
 * Hand-rolled rather than a `Popover`: the list must never take focus from the
 * caret, and there is no `cmdk` in this app to build a `Command` on. It lives
 * inside a dialog that is already positioned, so an absolute list is enough.
 */
export const ProductCombobox = ({
  id,
  value,
  onValueChange,
  onSelectProduct,
  products,
  placeholder,
  onBlur,
  'aria-invalid': ariaInvalid,
}: ProductComboboxProps) => {
  const listId = useId();
  const optionIdPrefix = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const term = value.trim().toLowerCase();
  const options = useMemo(
    // An empty box lists everything, so this still browses the way the dropdown
    // it replaces did.
    () => (term ? products.filter((product) => matches(product, term)) : products),
    [products, term],
  );

  const isListOpen = isOpen && options.length > 0;
  // The highlight is clamped rather than reset, so narrowing the list by typing
  // cannot leave it pointing past the end.
  const activeIndex = Math.min(highlighted, options.length - 1);

  const handleSelect = (product: ProductResponse): void => {
    onSelectProduct(product);
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      if (!isListOpen) return;
      // The dialog closes on Escape too; the list is the inner layer and goes first.
      event.stopPropagation();
      setIsOpen(false);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isListOpen) {
        setIsOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((current) => {
        const next = Math.min(current, options.length - 1) + step;
        return (next + options.length) % options.length;
      });
      return;
    }

    if (event.key === 'Enter' && isListOpen) {
      // Otherwise Enter would submit the line while the user is still choosing.
      event.preventDefault();
      handleSelect(options[activeIndex]);
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={isListOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isListOpen ? `${optionIdPrefix}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setHighlighted(0);
          setIsOpen(true);
        }}
        // Deliberately not `onFocus`: the dialog focuses this field on open, and a
        // list unfurling over the form before anyone has asked for one is in the
        // way. Typing opens it, and so do a click and ↓ — all of them asked for.
        onClick={() => setIsOpen(true)}
        onBlur={() => {
          setIsOpen(false);
          onBlur?.();
        }}
        onKeyDown={handleKeyDown}
        aria-invalid={ariaInvalid}
      />

      {isListOpen ? (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl p-1 shadow-md ring-1 ring-foreground/10"
        >
          {options.map((product, index) => (
            <li
              key={product.id}
              id={`${optionIdPrefix}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                'flex cursor-default items-center gap-3 rounded-md px-1.5 py-1 text-sm select-none',
                index === activeIndex && 'bg-accent text-accent-foreground',
              )}
              // Not onClick: the blur that closes the list would land first.
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(product);
              }}
              onMouseEnter={() => setHighlighted(index)}
            >
              <span className="truncate">
                {product.code ? (
                  <span className="text-muted-foreground">{product.code} · </span>
                ) : null}
                {product.name}
              </span>
              <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
                {money(product.lastPriceMinor, product.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
