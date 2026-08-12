/**
 * UTC month arithmetic.
 *
 * Everything here stays in UTC on purpose. The API resolves its default summary
 * window with `Date.UTC(y, m, 1)` → `Date.UTC(y, m + 1, 1)`, and `shortDate`
 * formats with `timeZone: 'UTC'`. A local-time helper would disagree with both:
 * in Asia/Jakarta (UTC+7) the local start of month is 17:00 on the previous day,
 * which silently misfiles every transaction on the 1st and the last of a month.
 *
 * That is also why no date library is installed for this — `date-fns`'s
 * `startOfMonth`/`subMonths` are local-time, so the convenience would have to be
 * undone with a timezone add-on. `Date.UTC` already normalises out-of-range
 * months (`Date.UTC(2026, -3, 1)` → 2025-10-01), which is the only non-trivial
 * arithmetic involved.
 */

/** A half-open UTC month, matching the API's `from` inclusive / `to` exclusive contract. */
export interface MonthWindow {
  /** `YYYY-MM` — a stable React key and label seed. */
  readonly key: string;
  /** Inclusive lower bound, ISO. */
  readonly from: string;
  /** Exclusive upper bound, ISO. */
  readonly to: string;
  readonly year: number;
  /** 0-11. */
  readonly month: number;
}

/** `month` may be out of range; `Date.UTC` normalises it (-3 → October of the prior year). */
export const utcMonthWindow = (year: number, month: number): MonthWindow => {
  const start = new Date(Date.UTC(year, month, 1));
  const resolvedYear = start.getUTCFullYear();
  const resolvedMonth = start.getUTCMonth();

  return {
    key: `${resolvedYear}-${String(resolvedMonth + 1).padStart(2, '0')}`,
    from: start.toISOString(),
    to: new Date(Date.UTC(resolvedYear, resolvedMonth + 1, 1)).toISOString(),
    year: resolvedYear,
    month: resolvedMonth,
  };
};

/** The month `now` falls in, in UTC. */
export const currentUtcMonth = (now: Date = new Date()): MonthWindow =>
  utcMonthWindow(now.getUTCFullYear(), now.getUTCMonth());

/** `count` consecutive windows ending with the current month, oldest first. */
export const lastUtcMonths = (count: number, now: Date = new Date()): MonthWindow[] =>
  Array.from({ length: count }, (_, index) =>
    utcMonthWindow(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index)),
  );

/** Every UTC day in the window as `YYYY-MM-DD`, oldest first. 28/29/30/31 fall out by construction. */
export const utcDaysIn = (window: MonthWindow): string[] => {
  const days: string[] = [];
  const end = new Date(window.to);

  for (
    const cursor = new Date(window.from);
    cursor < end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    days.push(cursor.toISOString().slice(0, 10));
  }

  return days;
};

/**
 * `occurredAt` is already a UTC ISO string, so its first ten characters *are*
 * the UTC day. Parsing it into a `Date` first is how timezone drift gets in.
 */
export const utcDayKey = (isoDate: string): string => isoDate.slice(0, 10);
