import Link from 'next/link';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';

import type { ExperimentManifest } from '@xrb/lab-core';

type ExperimentShellProps = {
  manifest: ExperimentManifest;
  children: React.ReactNode;
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function ExperimentShell({ manifest, children }: ExperimentShellProps) {
  return (
    <Section className="space-y-8">
      <Card className="space-y-4 border-white/15 bg-slate-900/70">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300">XRealityBytes Lab</p>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{manifest.title}</h1>
          <p className="text-sm text-slate-400">Published {formatDate(manifest.date)}</p>
          <p className="text-sm text-slate-300">{manifest.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manifest.tags.map((tag) => (
            <span
              key={`${manifest.slug}-${tag}`}
              className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-200"
            >
              {tag}
            </span>
          ))}
        </div>
      </Card>

      {children}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 border-white/15 bg-slate-900/70">
          <h2 className="text-lg font-semibold">What This Demonstrates</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
            {manifest.whatDemonstrates.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3 border-white/15 bg-slate-900/70">
          <h2 className="text-lg font-semibold">Compatibility + Source</h2>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>WebGPU path: {manifest.capabilities.webgpu ? 'Supported' : 'Not implemented'}</li>
            <li>WebGL2 fallback: {manifest.capabilities.webgl2 ? 'Supported' : 'Not implemented'}</li>
            <li>Static fallback: {manifest.capabilities.static ? 'Supported' : 'Not implemented'}</li>
          </ul>
          <p className="text-sm text-slate-300">
            Source folder:{' '}
            <span className="font-mono text-xs text-cyan-200">{manifest.sourcePath}</span>
          </p>
          <Link href="/lab" className="inline-flex text-sm text-cyan-300 transition hover:text-cyan-200">
            Back to all experiments
          </Link>
        </Card>
      </div>
    </Section>
  );
}
