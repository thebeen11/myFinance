'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Just below Tailwind's `md` breakpoint (48rem), in the form `matchMedia` wants. */
const MOBILE_QUERY = '(max-width: 47.99rem)';

/**
 * Whether a CSS media query currently matches.
 *
 * Prefer a Tailwind variant wherever the answer only changes styling — CSS is
 * correct at first paint, this hook is not. It exists for the cases where the
 * breakpoint has to reach JavaScript, such as a prop on a portalled widget that
 * renders outside the page's own stacking and cannot be styled responsively.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the server
 * snapshot is a separate function, so React never hydrates against a value the
 * server could not have known.
 */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // No viewport exists on the server; `false` keeps the markup desktop-shaped,
    // which is also what the CSS-only branches prerender as.
    () => false,
  );
};

/** True below Tailwind's `md` breakpoint — the same boundary the shell collapses at. */
export const useIsMobile = (): boolean => useMediaQuery(MOBILE_QUERY);
