import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { cache } from 'react';

import type { ExperimentManifest } from '@xrb/lab-core';

const EXPERIMENTS_DIR_CANDIDATES = [
  path.join(process.cwd(), 'experiments'),
  path.join(process.cwd(), '../../experiments'),
];

const EXPERIMENTS_DIR =
  EXPERIMENTS_DIR_CANDIDATES.find((candidate) => existsSync(candidate)) ??
  path.join(process.cwd(), 'experiments');

function isValidManifest(input: unknown): input is ExperimentManifest {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const manifest = input as Record<string, unknown>;

  return (
    typeof manifest.title === 'string' &&
    typeof manifest.slug === 'string' &&
    typeof manifest.date === 'string' &&
    Array.isArray(manifest.tags) &&
    manifest.tags.every((tag) => typeof tag === 'string') &&
    typeof manifest.description === 'string' &&
    Array.isArray(manifest.whatDemonstrates) &&
    manifest.whatDemonstrates.every((item) => typeof item === 'string') &&
    typeof manifest.sourcePath === 'string' &&
    typeof manifest.capabilities === 'object' &&
    manifest.capabilities !== null &&
    typeof (manifest.capabilities as Record<string, unknown>).webgpu === 'boolean' &&
    typeof (manifest.capabilities as Record<string, unknown>).webgl2 === 'boolean' &&
    typeof (manifest.capabilities as Record<string, unknown>).static === 'boolean'
  );
}

function compareByDateDesc(a: ExperimentManifest, b: ExperimentManifest): number {
  const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
  if (Number.isNaN(diff) || diff === 0) {
    return a.slug.localeCompare(b.slug);
  }

  return diff;
}

async function readManifest(directoryName: string): Promise<ExperimentManifest | null> {
  const manifestPath = path.join(EXPERIMENTS_DIR, directoryName, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return null;
  }

  const source = await readFile(manifestPath, 'utf8');
  const data = JSON.parse(source) as unknown;

  if (!isValidManifest(data)) {
    console.warn(`Invalid experiment manifest at ${manifestPath}. Entry skipped.`);
    return null;
  }

  return data;
}

export const getAllExperiments = cache(async (): Promise<ExperimentManifest[]> => {
  const entries = await readdir(EXPERIMENTS_DIR, { withFileTypes: true });

  const manifests = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => readManifest(entry.name)),
  );

  return manifests.filter((entry): entry is ExperimentManifest => entry !== null).sort(compareByDateDesc);
});

export const getExperimentBySlug = cache(async (slug: string): Promise<ExperimentManifest | null> => {
  const manifests = await getAllExperiments();
  return manifests.find((manifest) => manifest.slug === slug) ?? null;
});

export const getFeaturedExperiment = cache(async (): Promise<ExperimentManifest | null> => {
  const manifests = await getAllExperiments();
  return manifests[0] ?? null;
});
