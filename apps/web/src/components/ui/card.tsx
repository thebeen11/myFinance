import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * `tone` is the app's surface system, not stock shadcn. The design language
 * separates surfaces by step and hierarchy by inversion — the most important
 * figure on a page sits on `inverted`, and nesting an inverted tile inside a
 * default card (or the reverse) is how depth is expressed. Nothing here uses a
 * shadow.
 */
const cardVariants = cva(
  'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-2xl py-(--card-spacing) text-sm [--card-spacing:--spacing(5)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-2xl *:[img:last-child]:rounded-b-2xl',
  {
    variants: {
      tone: {
        default: 'bg-card text-card-foreground ring-1 ring-foreground/8',
        inverted: 'bg-inverted text-inverted-foreground',
        brand: 'bg-primary text-primary-foreground',
        muted: 'bg-muted text-foreground',
      },
    },
    defaultVariants: {
      tone: 'default',
    },
  },
);

function Card({
  className,
  size = 'default',
  tone,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof cardVariants> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-tone={tone ?? 'default'}
      className={cn(cardVariants({ tone }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-2xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        'text-sm text-muted-foreground group-data-[tone=inverted]/card:text-inverted-muted group-data-[tone=brand]/card:text-primary-foreground/75',
        className,
      )}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('px-(--card-spacing)', className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center rounded-b-2xl border-t bg-muted/50 p-(--card-spacing) group-data-[tone=inverted]/card:border-inverted-border group-data-[tone=inverted]/card:bg-white/5',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
