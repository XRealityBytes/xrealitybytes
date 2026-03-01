import type { PropsWithChildren } from 'react';

import { cn } from '@/lib/cn';

type CardProps = PropsWithChildren<{
  className?: string;
}>;

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-card/70 p-6 shadow-card backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}
