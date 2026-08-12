import type { ReactNode } from 'react';

/**
 * Eyebrow, title, right-aligned actions. Shared by every page so headings do not
 * drift in size or spacing between routes.
 */
export const PageHeader = ({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    {eyebrow ? <p className="text-muted-foreground text-sm">{eyebrow}</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  </div>
);
