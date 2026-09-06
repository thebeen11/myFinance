import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Eyebrow, title, right-aligned actions. Shared by every page so headings do not
 * drift in size or spacing between routes.
 *
 * `eyebrowClassName` exists for the detail pages, whose eyebrow is a back link:
 * on a phone the sticky header already carries one, and two stacked ways back is
 * noise rather than reassurance.
 */
export const PageHeader = ({
  eyebrow,
  eyebrowClassName,
  title,
  actions,
}: {
  eyebrow?: ReactNode;
  eyebrowClassName?: string;
  title: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    {eyebrow ? (
      <p className={cn('text-muted-foreground text-sm', eyebrowClassName)}>{eyebrow}</p>
    ) : null}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  </div>
);
