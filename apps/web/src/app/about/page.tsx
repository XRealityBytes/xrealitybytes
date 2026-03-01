import type { Metadata } from 'next';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';

export const metadata: Metadata = {
  title: 'About',
  description: 'XRealityBytes builds spatial products and generative media systems with production discipline.',
};

export default function AboutPage() {
  return (
    <Section
      title="About XRealityBytes"
      description="XRealityBytes is an independent spatial engineering studio focused on real-time systems that need both creative range and operational reliability."
      className="space-y-8"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3">
          <h3 className="text-xl font-semibold">What We Build</h3>
          <p className="text-sm text-slate-300">
            We design and implement interactive 3D experiences, rendering pipelines, and generative media workflows for
            web-first products and mixed-reality environments.
          </p>
        </Card>
        <Card className="space-y-3">
          <h3 className="text-xl font-semibold">How We Deliver</h3>
          <p className="text-sm text-slate-300">
            Every prototype is built with production constraints in mind: observability, graceful fallbacks, and code
            paths that can scale from demo to deployment.
          </p>
        </Card>
      </div>
      <Card className="space-y-3">
        <h3 className="text-xl font-semibold">Operating Principles</h3>
        <ul className="list-disc space-y-2 pl-6 text-sm text-slate-300">
          <li>Prototype with clear hypotheses, then instrument for measurable outcomes.</li>
          <li>Favor modular architecture over one-off scenes.</li>
          <li>Treat WebGPU capability detection and fallback behavior as first-class UX.</li>
          <li>Keep content and tooling in-repo for repeatable delivery workflows.</li>
        </ul>
      </Card>
    </Section>
  );
}
