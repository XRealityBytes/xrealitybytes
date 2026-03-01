export class PerfTracker {
  private lastFrameTime = 0;
  private sampleWindowStart = 0;
  private frameCount = 0;
  private latestFps = 0;
  private latestFrameMs = 0;

  sample(nowMs: number): { fps: number; frameTime: number } {
    if (this.lastFrameTime > 0) {
      this.latestFrameMs = nowMs - this.lastFrameTime;
    }
    this.lastFrameTime = nowMs;

    if (this.sampleWindowStart === 0) {
      this.sampleWindowStart = nowMs;
    }

    this.frameCount += 1;

    const elapsed = nowMs - this.sampleWindowStart;
    if (elapsed >= 500) {
      this.latestFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.sampleWindowStart = nowMs;
    }

    return {
      fps: this.latestFps,
      frameTime: this.latestFrameMs,
    };
  }
}
