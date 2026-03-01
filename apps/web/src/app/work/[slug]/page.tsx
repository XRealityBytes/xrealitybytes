import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { notFound } from 'next/navigation';
import remarkGfm from 'remark-gfm';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';
import { mdxComponents } from '@/components/mdx-components';
import { getAllWorkSlugs, getWorkBySlug } from '@/lib/content/content';

type WorkPageProps = {
  params: {
    slug: string;
  };
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

export async function generateStaticParams() {
  const slugs = await getAllWorkSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: WorkPageProps): Promise<Metadata> {
  const entry = await getWorkBySlug(params.slug);

  if (!entry) {
    return { title: 'Work' };
  }

  return {
    title: entry.frontmatter.title,
    description: entry.frontmatter.summary,
    openGraph: {
      title: entry.frontmatter.title,
      description: entry.frontmatter.summary,
      images: [entry.frontmatter.heroImage],
      type: 'article',
    },
  };
}

export default async function WorkDetailPage({ params }: WorkPageProps) {
  const entry = await getWorkBySlug(params.slug);
  if (!entry) {
    notFound();
  }

  return (
    <Section className="space-y-8">
      <Card className="space-y-4">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300">Case Study</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{entry.frontmatter.title}</h1>
          <p className="text-sm text-slate-400">Published {formatDate(entry.frontmatter.date)}</p>
          <p className="text-base text-slate-300">{entry.frontmatter.summary}</p>
        </div>
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
      </Card>
      <article className="prose prose-invert max-w-none rounded-2xl border border-white/10 bg-card/60 p-6 shadow-card sm:p-8">
        <MDXRemote source={entry.body} components={mdxComponents} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
      </article>
    </Section>
  );
}
