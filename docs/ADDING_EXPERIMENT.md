# Adding a Weekly Experiment

## Quick Start

From repo root:

```bash
pnpm new:experiment <slug> <title>
```

Example:

```bash
pnpm new:experiment 002-neural-noise "Neural Noise Surface"
```

## What the Generator Creates

- `experiments/<slug>/manifest.json`
- `experiments/<slug>/README.md`
- `experiments/<slug>/src/renderers/webgpu.ts`
- `experiments/<slug>/src/renderers/webgl2.ts`
- `apps/web/src/experiments/<slug>/<ComponentName>.tsx`
- Registry updates in `apps/web/src/lib/lab/runtime-registry.ts`

## Manual Follow-up

1. Update manifest tags/description/whatDemonstrates.
2. Implement real WebGPU + WebGL2 renderer logic.
3. Add any static fallback assets under `apps/web/public/experiments/<slug>/`.
4. Add a weekly entry to `content/weekly-log.md`.
5. Run checks:

```bash
pnpm lint
pnpm typecheck
pnpm build
```
