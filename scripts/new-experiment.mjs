#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function toPascalCase(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function writeFileSafe(filePath, content) {
  if (fs.existsSync(filePath)) {
    return false;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

function updateRegistry(registryPath, slug, componentName) {
  const source = fs.readFileSync(registryPath, 'utf8');
  const importLine = `import ${componentName} from '@/experiments/${slug}/${componentName}';`;
  const entryLine = `  '${slug}': ${componentName},`;

  let next = source;

  if (!next.includes(importLine)) {
    next = next.replace(/(import type \{ ComponentType \} from 'react';\n\n)/, `$1${importLine}\n`);
  }

  if (!next.includes(entryLine)) {
    next = next.replace(
      /(export const experimentRuntimeRegistry: Record<string, ComponentType<ExperimentEntryProps>> = \{\n)([\s\S]*?)(\n\};)/,
      (_, start, body, end) => `${start}${body}${body.trimEnd() ? '\n' : ''}${entryLine}${end}`,
    );
  }

  fs.writeFileSync(registryPath, next, 'utf8');
}

const [, , rawSlug, ...titleParts] = process.argv;

if (!rawSlug || titleParts.length === 0) {
  console.error('Usage: pnpm new:experiment <slug> <title>');
  process.exit(1);
}

const slug = rawSlug.trim().toLowerCase();
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error('Slug must only contain lowercase letters, numbers, and hyphens.');
  process.exit(1);
}

const title = titleParts.join(' ').trim();
const componentName = `${toPascalCase(slug)}Experiment`;
const today = new Date().toISOString().slice(0, 10);

const root = process.cwd();
const experimentDir = path.join(root, 'experiments', slug);
const appExperimentDir = path.join(root, 'apps/web/src/experiments', slug);
const posterDir = path.join(root, 'apps/web/public/experiments', slug);
const registryPath = path.join(root, 'apps/web/src/lib/lab/runtime-registry.ts');

if (fs.existsSync(experimentDir) || fs.existsSync(appExperimentDir)) {
  console.error(`Experiment ${slug} already exists.`);
  process.exit(1);
}

writeFileSafe(
  path.join(experimentDir, 'manifest.json'),
  JSON.stringify(
    {
      title,
      slug,
      date: today,
      tags: ['WebGPU', 'Weekly'],
      description: `TODO: describe ${title}.`,
      whatDemonstrates: ['TODO: add demonstration bullet points.'],
      sourcePath: `experiments/${slug}`,
      capabilities: {
        webgpu: true,
        webgl2: true,
        static: true,
      },
    },
    null,
    2,
  ) + '\n',
);

writeFileSafe(
  path.join(experimentDir, 'README.md'),
  `# ${title}\n\nTODO: document the experiment architecture and controls.\n`,
);

writeFileSafe(
  path.join(experimentDir, 'src/renderers/webgpu.ts'),
  `import type { RendererControl, RendererHooks } from '@xrb/lab-core';\n\nexport async function createWebGPUParticleRenderer(\n  _canvas: HTMLCanvasElement,\n  _hooks: RendererHooks,\n): Promise<RendererControl> {\n  throw new Error('TODO: implement WebGPU renderer for ${slug}.');\n}\n`,
);

writeFileSafe(
  path.join(experimentDir, 'src/renderers/webgl2.ts'),
  `import type { RendererControl, RendererHooks } from '@xrb/lab-core';\n\nexport async function createWebGL2ParticleRenderer(\n  _canvas: HTMLCanvasElement,\n  _hooks: RendererHooks,\n): Promise<RendererControl> {\n  throw new Error('TODO: implement WebGL2 renderer for ${slug}.');\n}\n`,
);

writeFileSafe(
  path.join(appExperimentDir, `${componentName}.tsx`),
  `'use client';\n\nimport { GpuCanvasHost } from '@/components/lab/GpuCanvasHost';\n\nimport { createWebGL2ParticleRenderer } from '@experiments/${slug}/src/renderers/webgl2';\nimport { createWebGPUParticleRenderer } from '@experiments/${slug}/src/renderers/webgpu';\n\nexport default function ${componentName}() {\n  return (\n    <GpuCanvasHost\n      createWebGPU={createWebGPUParticleRenderer}\n      createWebGL2={createWebGL2ParticleRenderer}\n      staticFallback={\n        <div className="text-center text-sm text-slate-300">\n          TODO: add static fallback poster for ${slug}.\n        </div>\n      }\n    />\n  );\n}\n`,
);

fs.mkdirSync(posterDir, { recursive: true });
writeFileSafe(
  path.join(posterDir, 'poster.svg'),
  `<svg width="1200" height="720" viewBox="0 0 1200 720" fill="none" xmlns="http://www.w3.org/2000/svg">\n  <rect width="1200" height="720" fill="#020617"/>\n  <text x="96" y="360" fill="#E2E8F0" font-size="48" font-family="sans-serif" font-weight="700">${title}</text>\n</svg>\n`,
);

updateRegistry(registryPath, slug, componentName);

console.log(`Scaffolded experiment ${slug}`);
console.log(`- ${experimentDir}`);
console.log(`- ${appExperimentDir}`);
console.log(`- ${posterDir}`);
console.log('Remember to implement renderer logic and update weekly-log.md.');
