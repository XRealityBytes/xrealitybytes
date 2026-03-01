# XRealityBytes Lab - Copilot Instructions

## Project Context

This repository is **XRealityBytes Lab**: a weekly-evolving experimental site for:

- WebGPU graphics
- WebGL2 fallbacks
- in-browser AI interaction patterns

Primary app is in `apps/web` (Next.js App Router + TypeScript).

## Architecture Rules

- Keep code TypeScript-first and strict-safe.
- Use App Router patterns (`src/app/**`).
- Experiments are self-contained in `experiments/<slug>/`.
- Shared runtime and types belong in `packages/lab-core`.
- Weekly updates live in `content/weekly-log.md`.

## Rendering and Fallback Policy

Always preserve this tier order:

1. WebGPU
2. WebGL2 fallback
3. Static fallback (never break navigation)

GPU canvas logic must run client-side only. Do not introduce SSR paths that touch GPU APIs.

## Experiment Workflow

- Use `pnpm new:experiment <slug> <title>` to scaffold.
- Add/maintain `experiments/<slug>/manifest.json`.
- Register runtime component in `apps/web/src/lib/lab/runtime-registry.ts`.
- Ensure `/lab/[slug]` works with graceful fallback behavior.

## Dependency and Style Constraints

- Prefer minimal dependencies; avoid heavy packages unless clearly required.
- Reuse existing utilities/components before adding new abstractions.
- Keep UI lab-like: dark graphite, subtle grid, single accent color.
- Avoid large assets; use lightweight placeholders where possible.

## Validation Before Finalizing

Run:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

If adding runtime behavior, verify `pnpm dev` and manually test:

- `/`
- `/lab`
- `/lab/001-particle-field`
- `/log`

## Legacy Preservation

Do not remove legacy baseline routes unless explicitly requested:

- `/work`
- `/tools`
- `/about`
- `/contact`

Use redirects when replacing old demo URLs.
