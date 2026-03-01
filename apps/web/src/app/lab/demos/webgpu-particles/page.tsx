import type { Metadata } from 'next';

import WebGpuParticlesDemo from '@/components/lab/WebGpuParticlesDemo';
import { Section } from '@/components/Section';

export const metadata: Metadata = {
  title: 'Lab: WebGPU Particles',
  description: 'Instanced particle demo with WebGPU detection and WebGL fallback renderer.',
};

export default function WebGpuParticlesPage() {
  return (
    <Section
      title="WebGPU Particles"
      description="Instanced particle motion with runtime detection for WebGPU and automatic WebGL fallback."
      className="space-y-6"
    >
      <WebGpuParticlesDemo />
    </Section>
  );
}
