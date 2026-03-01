import Link from 'next/link';

import { Card } from '@/components/Card';

import type { ExperimentManifest } from '@xrb/lab-core';

type ExperimentCardProps = {
  experiment: ExperimentManifest;
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function ExperimentCard({ experiment }: ExperimentCardProps) {
  return (
    <Card className="h-full space-y-4 border-white/15 bg-slate-900/65">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-400">
        <span>Experiment</span>
        <time dateTime={experiment.date}>{formatDate(experiment.date)}</time>
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-slate-100">{experiment.title}</h3>
        <p className="text-sm text-slate-300">{experiment.description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {experiment.tags.map((tag) => (
          <span
            key={`${experiment.slug}-${tag}`}
            className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-200"
          >
            {tag}
          </span>
        ))}
      </div>
      <Link
        href={`/lab/${experiment.slug}`}
        className="inline-flex items-center rounded-full border border-white/20 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
      >
        Open experiment
      </Link>
    </Card>
  );
}
