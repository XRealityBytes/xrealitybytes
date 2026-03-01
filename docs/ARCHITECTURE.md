# Architecture

## Repository Layout

- `apps/web`: Next.js App Router application and public UI.
- `experiments`: self-contained experiment folders (manifest + render runtime code).
- `packages/lab-core`: shared types + capability detection + perf primitives.
- `content`: markdown content (weekly log).
- `docs`: contributor and architecture docs.

## Runtime Model

1. `apps/web/src/lib/lab/manifests.ts` reads `experiments/**/manifest.json`.
2. `/` and `/lab` render experiment cards sorted by date descending.
3. `/lab/[slug]` resolves manifest + experiment entry component from a registry.
4. Each experiment uses `GpuCanvasHost` to resolve rendering tier:
   - WebGPU if adapter/device succeeds
   - WebGL2 fallback if available
   - static fallback otherwise

## Legacy Preservation

Legacy routes (`/work`, `/tools`, `/about`, `/contact`) remain intact.
Old demo URLs are redirected in `apps/web/next.config.ts` to preserve links.

## Performance + Diagnostics

`@xrb/lab-core` exposes:

- `detectCapabilities()` for WebGPU/WebGL2 tier probing
- `PerfTracker` for fps + frame-time snapshots
- shared renderer/manifest types

The diagnostics panel can be toggled by UI button or `P` key.
