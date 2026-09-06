'use client';

import * as React from 'react';
import { Dialog as SheetPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';

/**
 * An edge-anchored panel, built on the same Radix `Dialog` primitive as
 * `ui/dialog.tsx` — a sheet is a dialog that arrives from a side rather than the
 * centre, so it needs no separate dependency. Overlay, ring and duration are
 * copied from `ui/dialog.tsx` deliberately: that file is hand-tuned away from
 * the stock registry, and the two are meant to read as one family.
 *
 * Each side in `SIDES` carries its own axis and size, not just its animation: a
 * bottom sheet is full-width and height-capped where an edge panel is full-height
 * and width-capped, so the two cannot share a base.
 */
const SIDES = {
  left: 'inset-y-0 left-0 w-[min(20rem,85vw)] data-open:slide-in-from-left data-closed:slide-out-to-left',
  right:
    'inset-y-0 right-0 w-[min(20rem,85vw)] data-open:slide-in-from-right data-closed:slide-out-to-right',
  bottom:
    'inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-3xl pb-[calc(1rem+var(--safe-b))] data-open:slide-in-from-bottom data-closed:slide-out-to-bottom',
} as const;

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'left',
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof SIDES;
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col gap-6 overflow-y-auto overscroll-contain bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-200 outline-none data-open:animate-in data-closed:animate-out',
          SIDES[side],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="sheet-header" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-heading text-base leading-none font-medium', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
