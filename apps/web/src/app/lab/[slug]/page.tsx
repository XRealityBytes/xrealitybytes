import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ExperimentShell } from '@/components/lab/ExperimentShell';
import { getAllExperiments, getExperimentBySlug } from '@/lib/lab/manifests';
import { experimentRuntimeRegistry } from '@/lib/lab/runtime-registry';

type LabSlugPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const experiments = await getAllExperiments();
  return experiments.map((experiment) => ({ slug: experiment.slug }));
}

export async function generateMetadata({ params }: LabSlugPageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await getExperimentBySlug(slug);

  if (!manifest) {
    return {
      title: 'Experiment Not Found',
    };
  }

  return {
    title: manifest.title,
    description: manifest.description,
    openGraph: {
      title: manifest.title,
      description: manifest.description,
      type: 'article',
    },
  };
}

export default async function LabSlugPage({ params }: LabSlugPageProps) {
  const { slug } = await params;

  const manifest = await getExperimentBySlug(slug);
  const ExperimentEntry = experimentRuntimeRegistry[slug];

  if (!manifest || !ExperimentEntry) {
    notFound();
  }

  return (
    <ExperimentShell manifest={manifest}>
      <ExperimentEntry manifest={manifest} />
    </ExperimentShell>
  );
}
