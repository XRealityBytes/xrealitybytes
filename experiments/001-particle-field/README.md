# Experiment 001: Compute-Driven Particle Field

This experiment establishes the baseline XRealityBytes Lab runtime stack.

- **Primary tier:** WebGPU compute + render pipeline.
- **Fallback tier:** WebGL2 with CPU particle updates.
- **Last-resort tier:** static informational panel so navigation never breaks.

Controls:

- Pointer/touch pulls particles toward the cursor while active.
- Prompt text influences simulation energy.
- Diagnostics panel can be toggled with `P` or the UI button.
