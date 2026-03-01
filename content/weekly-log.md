# XRealityBytes Lab Log

## Week 001 - March 1, 2026

### Launch Focus

XRealityBytes has been reorganized into a public lab model with weekly experiment releases.

- Introduced `experiments/` as the canonical source for experiment manifests and runtime code.
- Added a shared `GpuCanvasHost` with hard fallbacks (`WebGPU -> WebGL2 -> static`).
- Converted the homepage to a lab index with a featured experiment and timeline cards.

### Experiment 001: Compute-Driven Particle Field

- **Primary path:** WebGPU compute + render pass for particle simulation.
- **Fallback path:** WebGL2 CPU simulation with additive point rendering.
- **Compatibility path:** static poster and explanation on unsupported devices.

### Notes for Week 002

- Add an in-browser AI control experiment with lightweight WASM inference.
- Expand diagnostics with moving average frame-time graph.
- Add replay snapshots for experiment comparisons.
