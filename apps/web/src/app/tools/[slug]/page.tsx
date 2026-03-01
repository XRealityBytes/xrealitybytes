import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import remarkGfm from 'remark-gfm';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';
import { mdxComponents } from '@/components/mdx-components';
import { getAllToolSlugs, getToolBySlug } from '@/lib/content/content';

type ToolPageProps = {
  params: {
    slug: string;
  };
};

export async function generateStaticParams() {
  const slugs = await getAllToolSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const entry = await getToolBySlug(params.slug);

  if (!entry) {
    return { title: 'Tools' };
  }

  return {
    title: entry.frontmatter.title,
    description: entry.frontmatter.summary,
    openGraph: {
      title: entry.frontmatter.title,
      description: entry.frontmatter.summary,
      type: 'article',
    },
  };
}

export default async function ToolDetailPage({ params }: ToolPageProps) {
  const entry = await getToolBySlug(params.slug);
  if (!entry) {
    notFound();
  }

  return (
    <Section className="space-y-8">
      <Card className="space-y-5">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300">Tool Profile</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{entry.frontmatter.title}</h1>
          <p className="text-sm text-slate-300">{entry.frontmatter.summary}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-slate-300">
          <span className="rounded-full border border-white/15 px-3 py-1">Platform: {entry.frontmatter.platform}</span>
          <span className="rounded-full border border-cyan-300/40 px-3 py-1 text-cyan-200">
            Status: {entry.frontmatter.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          {entry.frontmatter.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm transition hover:bg-white/10"
            >
              {link.label}
              <ExternalLink size={14} />
            </Link>
          ))}
        </div>
      </Card>
      <article className="prose prose-invert max-w-none rounded-2xl border border-white/10 bg-card/60 p-6 shadow-card sm:p-8">
        <MDXRemote source={entry.body} components={mdxComponents} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
      </article>
    </Section>
  );
}
