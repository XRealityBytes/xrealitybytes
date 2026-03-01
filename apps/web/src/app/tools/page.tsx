import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';
import { getAllTools } from '@/lib/content/content';

export const metadata: Metadata = {
  title: 'Tools',
  description: 'Production-facing tooling for spatial runtimes and generative systems.',
};

export default async function ToolsPage() {
  const tools = await getAllTools();

  return (
    <Section
      title="Tools"
      description="In-repo tooling modules that support development velocity, reliability, and shipping confidence."
      className="space-y-8"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <Card key={tool.slug} className="h-full space-y-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
              <span>{tool.frontmatter.platform}</span>
              <span className="text-cyan-300">{tool.frontmatter.status}</span>
            </div>
            <h3 className="text-xl font-semibold">{tool.frontmatter.title}</h3>
            <p className="text-sm text-slate-300">{tool.frontmatter.summary}</p>
            <Link
              href={`/tools/${tool.slug}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
            >
              Read tool notes
              <ArrowRight size={14} />
            </Link>
          </Card>
        ))}
      </div>
    </Section>
  );
}
