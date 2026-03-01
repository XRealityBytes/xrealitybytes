export type BlendshapeMap = Record<string, number>;

type BlendshapeSmootherOptions = {
  alpha?: number;
  keys?: readonly string[];
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

export class BlendshapeEmaSmoother {
  private readonly alpha: number;
  private readonly keys: readonly string[] | null;
  private readonly values = new Map<string, number>();

  constructor(options: BlendshapeSmootherOptions = {}) {
    const configuredAlpha = options.alpha;
    this.alpha =
      typeof configuredAlpha === 'number' && Number.isFinite(configuredAlpha)
        ? Math.min(1, Math.max(0.01, configuredAlpha))
        : 0.35;
    this.keys = options.keys ?? null;
  }

  reset(): void {
    this.values.clear();
  }

  update(input: BlendshapeMap): BlendshapeMap {
    const output: BlendshapeMap = {};
    const keys = this.keys ?? Object.keys(input);

    for (const key of keys) {
      const current = clamp01(input[key] ?? 0);
      const previous = this.values.get(key) ?? current;
      const next = previous + (current - previous) * this.alpha;
      this.values.set(key, next);
      output[key] = next;
    }

    return output;
  }
}
