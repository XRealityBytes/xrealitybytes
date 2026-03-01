import type { Metadata } from 'next';
import Link from 'next/link';

import { Card } from '@/components/Card';
import { ExperimentCard } from '@/components/lab/ExperimentCard';
import { Section } from '@/components/Section';
import { getAllExperiments, getFeaturedExperiment } from '@/lib/lab/manifests';

export const metadata: Metadata = {
  title: 'XRealityBytes Lab',
  description: 'Weekly experiments in WebGPU graphics and in-browser AI systems, with graceful fallbacks.',
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export default async function HomePage() {
  const [featured, experiments] = await Promise.all([getFeaturedExperiment(), getAllExperiments()]);

  return (
    <div className="space-y-14">
      <Section className="space-y-7">
        <div className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300">XRealityBytes Lab</p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-100 sm:text-5xl">
            Weekly interactive experiments for WebGPU graphics and in-browser AI.
          </h1>
          <p className="max-w-3xl text-base text-slate-300">
            Public prototypes exploring rendering pipelines, runtime AI controls, and production fallback strategies.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/lab"
              className="inline-flex items-center rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
            >
              Browse Experiments
            </Link>
            <Link
              href="/log"
              className="inline-flex items-center rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/10"
            >
              Read Lab Log
            </Link>
          </div>
        </div>
      </Section>

      {featured ? (
        <Section title="Featured Experiment" description="The latest weekly release.">
          <Card className="space-y-5 border-cyan-400/30 bg-slate-900/75">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
              <span>Latest</span>
              <time dateTime={featured.date}>{formatDate(featured.date)}</time>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-slate-100">{featured.title}</h2>
              <p className="text-sm text-slate-300">{featured.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {featured.tags.map((tag) => (
                <span
                  key={`${featured.slug}-${tag}`}
                  className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-2.5 py-1 text-xs text-cyan-200"
                >
                  {tag}
                </span>
              ))}
            </div>
            <Link
              href={`/lab/${featured.slug}`}
              className="inline-flex items-center rounded-full border border-white/20 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
            >
              Open {featured.slug}
            </Link>
          </Card>
        </Section>
      ) : null}

      <Section title="Experiment Timeline" description="Newest first. Each experiment is a durable permalink at /lab/[slug].">
        <div className="grid gap-4 md:grid-cols-2">
          {experiments.map((experiment) => (
            <ExperimentCard key={experiment.slug} experiment={experiment} />
          ))}
        </div>
      </Section>

      <Section title="Legacy Baseline" description="Original XRealityBytes sections remain available while Lab evolves weekly.">
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/work" className="rounded-full border border-white/20 px-4 py-2 text-slate-200 transition hover:bg-white/10">
            Work
          </Link>
          <Link href="/tools" className="rounded-full border border-white/20 px-4 py-2 text-slate-200 transition hover:bg-white/10">
            Tools
          </Link>
          <Link href="/about" className="rounded-full border border-white/20 px-4 py-2 text-slate-200 transition hover:bg-white/10">
            About
          </Link>
          <Link href="/contact" className="rounded-full border border-white/20 px-4 py-2 text-slate-200 transition hover:bg-white/10">
            Contact
          </Link>
        </div>
      </Section>
    </div>
  );
}
