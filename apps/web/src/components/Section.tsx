import type { PropsWithChildren } from 'react';

import { cn } from '@/lib/cn';

type SectionProps = PropsWithChildren<{
  title?: string;
  description?: string;
  className?: string;
}>;

export function Section({ title, description, className, children }: SectionProps) {
  return (
    <section className={cn('space-y-6', className)}>
      {(title || description) && (
        <div className="max-w-3xl space-y-2">
          {title ? <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2> : null}
          {description ? <p className="text-sm text-slate-300 sm:text-base">{description}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}
