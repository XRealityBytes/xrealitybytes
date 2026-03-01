import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';
import { getAllWork } from '@/lib/content/content';

export const metadata: Metadata = {
  title: 'Work',
  description: 'Case studies covering architecture, outcomes, and operational constraints.',
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export default async function WorkPage() {
  const workEntries = await getAllWork();

  return (
    <Section
      title="Work"
      description="Case studies from spatial products and generative systems delivered in production environments."
      className="space-y-8"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {workEntries.map((entry) => (
          <Card key={entry.slug} className="h-full space-y-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
              <span>Case Study</span>
              <time dateTime={entry.frontmatter.date}>{formatDate(entry.frontmatter.date)}</time>
            </div>
            <h3 className="text-xl font-semibold">{entry.frontmatter.title}</h3>
            <p className="text-sm text-slate-300">{entry.frontmatter.summary}</p>
            <div className="flex flex-wrap gap-2">
              {entry.frontmatter.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-200"
                >
                  {tag}
                </span>
              ))}
            </div>
            <Link
              href={`/work/${entry.slug}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
            >
              Read full case study
              <ArrowRight size={14} />
            </Link>
          </Card>
        ))}
      </div>
    </Section>
  );
}
