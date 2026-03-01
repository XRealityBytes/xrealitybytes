import type { Metadata } from 'next';

import PointCloudViewerDemo from '@/components/lab/PointCloudViewerDemo';
import { Section } from '@/components/Section';

export const metadata: Metadata = {
  title: 'Lab: Pointcloud Viewer',
  description: 'Pointcloud viewer with local dataset loading and renderer fallback support.',
};

export default function PointCloudViewerPage() {
  return (
    <Section
      title="Pointcloud Viewer"
      description="Pseudo gaussian-style pointcloud viewer with orbit navigation and point-size control."
      className="space-y-6"
    >
      <PointCloudViewerDemo />
    </Section>
  );
}
