export type FeatureTier = 'webgpu' | 'webgl2' | 'static';

export interface CapabilityReport {
  tier: FeatureTier;
  hasNavigatorGpu: boolean;
  webgpu: {
    available: boolean;
    adapterName?: string;
    architecture?: string;
    description?: string;
    vendor?: string;
    reason?: string;
  };
  webgl2: {
    available: boolean;
  };
}

export interface ExperimentManifest {
  title: string;
  slug: string;
  date: string;
  tags: string[];
  description: string;
  whatDemonstrates: string[];
  sourcePath: string;
  capabilities: {
    webgpu: boolean;
    webgl2: boolean;
    static: boolean;
  };
}

export interface DiagnosticsSnapshot {
  fps: number;
  frameTime: number;
  tier: FeatureTier;
}

export interface HostControlState {
  pointerX: number;
  pointerY: number;
  pointerDown: boolean;
  prompt: string;
}

export interface RendererHooks {
  onFrameSample: (frameMs: number) => void;
  onError?: (error: unknown) => void;
}

export interface RendererControl {
  start: () => void;
  stop: () => void;
  resize: (width: number, height: number, dpr: number) => void;
  updateControlState: (state: HostControlState) => void;
  dispose: () => void;
}
