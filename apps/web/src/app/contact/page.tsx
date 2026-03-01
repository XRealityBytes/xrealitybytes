import type { Metadata } from 'next';

import { Card } from '@/components/Card';
import { Section } from '@/components/Section';
import { ContactForm } from '@/components/contact/ContactForm';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Start a conversation about spatial products, WebGPU prototypes, or production tooling.',
};

export default function ContactPage() {
  return (
    <Section
      title="Contact"
      description="Tell us what you are building, the constraints that matter, and where you need delivery support."
      className="space-y-8"
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <ContactForm />
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Project Fit</h2>
          <p className="text-sm text-slate-300">
            We typically engage on spatial web platforms, generative media systems, and rendering infrastructure where
            reliability matters as much as visual quality.
          </p>
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              <strong className="text-slate-100">Typical scope:</strong> 4-12 week sprints
            </p>
            <p>
              <strong className="text-slate-100">Delivery:</strong> architecture + implementation
            </p>
            <p>
              <strong className="text-slate-100">Timezone:</strong> UTC and US overlap
            </p>
          </div>
        </Card>
      </div>
    </Section>
  );
}
