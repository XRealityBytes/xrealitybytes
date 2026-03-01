import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';
import { getWeeklyLog } from '@/lib/lab/log';

export const metadata: Metadata = {
  title: 'Lab Log',
  description: 'Weekly updates for XRealityBytes Lab experiments and technical changes.',
};

export default async function LogPage() {
  const source = await getWeeklyLog();

  return (
    <Section
      title="Lab Log"
      description="Weekly notes on experiment releases, architecture changes, and performance findings."
      className="space-y-8"
    >
      <Card className="border-white/15 bg-slate-900/70 p-0">
        <article className="prose prose-invert max-w-none p-6 sm:p-8">
          <MDXRemote source={source} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
        </article>
      </Card>
    </Section>
  );
}
