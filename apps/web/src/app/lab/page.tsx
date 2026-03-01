import type { Metadata } from 'next';

import { ExperimentCard } from '@/components/lab/ExperimentCard';
import { Section } from '@/components/Section';
import { getAllExperiments } from '@/lib/lab/manifests';

export const metadata: Metadata = {
  title: 'Lab Experiments',
  description: 'All XRealityBytes Lab experiments sorted by release date.',
};

export default async function LabPage() {
  const experiments = await getAllExperiments();

  return (
    <Section
      title="Experiment Archive"
      description="Every experiment is versioned by slug and designed with renderer fallbacks."
      className="space-y-8"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {experiments.map((experiment) => (
          <ExperimentCard key={experiment.slug} experiment={experiment} />
        ))}
      </div>
    </Section>
  );
}
