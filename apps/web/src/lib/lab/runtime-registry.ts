import type { ComponentType } from 'react';

import type { ExperimentManifest } from '@xrb/lab-core';

import ParticleFieldExperiment from '@/experiments/001-particle-field/ParticleFieldExperiment';

export type ExperimentEntryProps = {
  manifest: ExperimentManifest;
};

export const experimentRuntimeRegistry: Record<string, ComponentType<ExperimentEntryProps>> = {
  '001-particle-field': ParticleFieldExperiment,
};
