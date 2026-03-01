# XRealityBytes Lab

XRealityBytes Lab is a public-facing experimental site for interactive WebGPU graphics and in-browser AI demos that evolves weekly.

## Current State (Week 002)

- Monorepo layout is active (`apps/web`, `experiments`, `packages`, `content`, `docs`).
- Core lab routes are live: `/`, `/lab`, `/lab/[slug]`, `/log`.
- Experiment 001 (particle field) is running with WebGPU -> WebGL2 -> static fallback.
- Experiment 002 (voice chatbot avatar) is running with local-first STT/LLM/TTS fallback path.
- Optional A2BS streaming is integrated in Experiment 002 with:
  - mic PCM fork (parallel to chatbot voice pipeline)
  - websocket blendshape stream client
  - avatar expression driving + live blendshape diagnostics panel
- Local A2BS checkpoint is present at `.local/a2bs/ckpt/simplenet1.pth`.

## What We Are Working On Now

- Hardening Experiment 002 end-to-end latency:
  - keep chat response and speech output as low-latency as possible
  - stabilize A2BS realtime behavior under variable network/device load
- Moving A2BS from stub inference to full model-forward inference using the local checkpoint.
- Production readiness:
  - websocket proxy path (`/ws/a2bs`) for hosted deployment
  - service health, observability, and reconnect/backpressure tuning

## Next Steps

1. Implement full `A2BS_STUB=0` inference forward pass (replace placeholder path).
2. Add automated smoke tests for `/api/voice/stt`, `/api/chat/respond`, and A2BS websocket health/connectivity.
3. Add deploy profile with reverse-proxy config for `/ws/a2bs` + secured env management.
4. Expand Experiment 002 avatar controls (calibration/smoothing presets and expression range tuning).
5. Ship Week 003 experiment and append changelog entry in `content/weekly-log.md`.

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
pnpm model:serve
pnpm model:pull [model]
pnpm model:stop
```

## A2BS Streaming (Experiment 002)

Experiment 002 now supports an optional parallel A2BS (audio->blendshape) channel.

1. Start the A2BS websocket service:

```bash
docker compose up a2bs-server
```

For real-model mode (loads `.local/a2bs/ckpt/simplenet1.pth`):

```bash
A2BS_STUB=0 docker compose up a2bs-server
```

2. Configure web env:

```bash
NEXT_PUBLIC_A2BS_WS_URL=ws://localhost:8765/ws/a2bs
# or proxied path:
# NEXT_PUBLIC_A2BS_WS_URL=/ws/a2bs
```

3. In `/lab/002-voice-driven-chatbot-avatar`, enable **Avatar / Blendshapes**.

Notes:
- The chatbot pipeline remains functional if A2BS is disabled or unavailable.
- For hosted deployments, proxy `/ws/a2bs` to the python service and set:
  `NEXT_PUBLIC_A2BS_WS_URL=wss://<your-domain>/ws/a2bs`.

## Local Llama Model (Repo-Local Cache)

This repo supports a repo-local Ollama model cache under `.local/ollama/models` (gitignored).

1. Start local Ollama server for this repo:

```bash
pnpm model:serve
```

2. Pull a model (default is `llama3.2:1b`):

```bash
pnpm model:pull
# or
pnpm model:pull llama3.2:3b
```

3. Stop repo-local Ollama process:

```bash
pnpm model:stop
```

## Local STT Service (Self-Hosted)

`/api/voice/stt` is now local-first so transcription can run on your own server.

Add this to `apps/web/.env.local`:

```bash
XRB_STT_BACKEND=local
XRB_STT_LOCAL_ENDPOINT=http://127.0.0.1:8080/inference
XRB_STT_LOCAL_FIELD=file
XRB_STT_LOCAL_LANGUAGE=en
XRB_STT_TIMEOUT_MS=45000
```

The local STT endpoint should return one of:
- `{ "text": "..." }` (preferred)
- `{ "transcript": "..." }`
- `{ "segments": [{ "text": "..." }] }`

If needed, you can still switch to OpenAI STT:

```bash
XRB_STT_BACKEND=openai
OPENAI_API_KEY=...
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
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
