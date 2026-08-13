import { House } from 'lucide-react';

import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'size-8 rounded-xl [&_svg]:size-4',
  md: 'size-10 rounded-2xl [&_svg]:size-5',
  lg: 'size-12 rounded-2xl [&_svg]:size-6',
} as const;

/**
 * The green tile that stands in for a logo.
 *
 * There is no brand asset in this repository and none is being invented here:
 * the wordmark "Erumah" is the real identity, and this is a stock glyph on the
 * brand colour — a house, because "rumah" is what the name is built on. Swapping
 * it for a real mark should touch only this file.
 */
export const BrandMark = ({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) => (
  <span
    aria-hidden
    className={cn(
      'bg-primary text-primary-foreground inline-flex items-center justify-center',
      SIZES[size],
      className,
    )}
  >
    <House strokeWidth={2.25} />
  </span>
);
