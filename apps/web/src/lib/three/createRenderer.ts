import * as THREE from 'three';

export type RendererMode = 'webgpu' | 'webgl';

export type UnifiedRenderer = {
  setSize: (width: number, height: number, updateStyle?: boolean) => void;
  setPixelRatio: (value: number) => void;
  render: (scene: unknown, camera: unknown) => void;
  dispose: () => void;
  setAnimationLoop?: (callback: ((time: number) => void) | null) => void;
  outputColorSpace?: unknown;
};

export type RendererResult = {
  renderer: UnifiedRenderer;
  mode: RendererMode;
};

function hasNavigatorGpu(): boolean {
  const navigatorWithGpu = navigator as Navigator & { gpu?: unknown };
  return Boolean(navigatorWithGpu.gpu);
}

export async function createBestRenderer(canvas: HTMLCanvasElement): Promise<RendererResult> {
  if (typeof window !== 'undefined' && hasNavigatorGpu()) {
    try {
      const { WebGPURenderer } = await import('three/webgpu');
      const renderer = new WebGPURenderer({
        canvas,
        antialias: true,
        alpha: true,
      }) as UnifiedRenderer;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

      return {
        renderer,
        mode: 'webgpu',
      };
    } catch (error) {
      console.warn('WebGPU renderer init failed, using WebGL fallback.', error);
    }
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  return {
    renderer: renderer as UnifiedRenderer,
    mode: 'webgl',
  };
}
