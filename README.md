# XRealityBytes Lab

XRealityBytes Lab is a public-facing experimental site for interactive WebGPU graphics and in-browser AI demos that evolves weekly.

## Structure

```text
.
├─ apps/
│  └─ web/                     # Next.js App Router site
├─ experiments/                # self-contained experiment sources + manifests
├─ packages/
│  ├─ config/                  # shared TS + ESLint config
│  └─ lab-core/                # capability detection + perf + shared types
├─ content/
│  └─ weekly-log.md            # markdown lab updates
├─ docs/
│  ├─ ARCHITECTURE.md
│  └─ ADDING_EXPERIMENT.md
└─ scripts/
   └─ new-experiment.mjs       # generator
```

## Run Locally

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Key Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
pnpm new:experiment <slug> <title>
```

## Experiment Workflow

1. Generate scaffold:

```bash
pnpm new:experiment 002-your-slug "Experiment Title"
```

2. Implement renderers in `experiments/<slug>/src/renderers/`.
3. Fill manifest metadata in `experiments/<slug>/manifest.json`.
4. Add/update static fallback asset under `apps/web/public/experiments/<slug>/poster.svg`.
5. Add a new weekly entry in `content/weekly-log.md`.

## Fallback Behavior

Each experiment runs through a stable tiered runtime:

1. **WebGPU** (preferred): checks `navigator.gpu` and adapter/device success.
2. **WebGL2** fallback when WebGPU is unavailable or renderer init fails.
3. **Static** fallback if neither GPU tier is available.

The diagnostics panel (toggle button or `P` key) displays:

- active tier
- fps
- frame time
- capability probe details

## Legacy Baseline

Original XRealityBytes sections remain available:

- `/work`
- `/tools`
- `/about`
- `/contact`

Legacy demo routes are redirected where applicable.
