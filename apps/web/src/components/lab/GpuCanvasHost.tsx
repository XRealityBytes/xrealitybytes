'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  detectCapabilities,
  PerfTracker,
  type CapabilityReport,
  type FeatureTier,
  type HostControlState,
  type RendererControl,
  type RendererHooks,
} from '@xrb/lab-core';

type RendererFactory = (canvas: HTMLCanvasElement, hooks: RendererHooks) => Promise<RendererControl>;

type GpuCanvasHostProps = {
  createWebGPU?: RendererFactory;
  createWebGL2?: RendererFactory;
  staticFallback: React.ReactNode;
};

type DiagnosticsState = {
  fps: number;
  frameTime: number;
};

const INITIAL_CONTROL_STATE: HostControlState = {
  pointerX: 0,
  pointerY: 0,
  pointerDown: false,
  prompt: '',
};

export function GpuCanvasHost({ createWebGPU, createWebGL2, staticFallback }: GpuCanvasHostProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<RendererControl | null>(null);
  const perfRef = useRef(new PerfTracker());
  const activeTierRef = useRef<FeatureTier>('static');
  const controlStateRef = useRef<HostControlState>(INITIAL_CONTROL_STATE);

  const [capabilities, setCapabilities] = useState<CapabilityReport | null>(null);
  const [activeTier, setActiveTier] = useState<FeatureTier>('static');
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({ fps: 0, frameTime: 0 });
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [prompt, setPrompt] = useState('');

  const compatibilityLabel = useMemo(() => {
    if (!capabilities) {
      return 'Probing capabilities...';
    }

    if (activeTier === 'webgpu') {
      return 'WebGPU active';
    }

    if (activeTier === 'webgl2') {
      return 'WebGL2 fallback active';
    }

    return 'Static fallback active';
  }, [activeTier, capabilities]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'p') {
        setShowDiagnostics((current) => !current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    controlStateRef.current = {
      ...controlStateRef.current,
      prompt,
    };
    rendererRef.current?.updateControlState(controlStateRef.current);
  }, [prompt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const destroyRenderer = () => {
      rendererRef.current?.stop();
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };

    const hooks: RendererHooks = {
      onFrameSample: (frameMs) => {
        const sample = perfRef.current.sample(performance.now());
        setDiagnostics({
          fps: sample.fps,
          frameTime: Number.isFinite(frameMs) ? frameMs : sample.frameTime,
        });
      },
      onError: () => {
        // Errors are handled by fallback tier selection to avoid noisy console spam.
      },
    };

    const applyResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio, 2);
      rendererRef.current?.resize(width, height, dpr);
    };

    const tryCreate = async (tier: FeatureTier): Promise<boolean> => {
      if (!canvas || disposed) {
        return false;
      }

      try {
        if (tier === 'webgpu' && createWebGPU) {
          rendererRef.current = await createWebGPU(canvas, hooks);
          activeTierRef.current = 'webgpu';
          setActiveTier('webgpu');
          rendererRef.current.updateControlState(controlStateRef.current);
          applyResize();
          rendererRef.current.start();
          return true;
        }

        if (tier === 'webgl2' && createWebGL2) {
          rendererRef.current = await createWebGL2(canvas, hooks);
          activeTierRef.current = 'webgl2';
          setActiveTier('webgl2');
          rendererRef.current.updateControlState(controlStateRef.current);
          applyResize();
          rendererRef.current.start();
          return true;
        }
      } catch {
        destroyRenderer();
      }

      return false;
    };

    const init = async () => {
      const report = await detectCapabilities();
      if (disposed) {
        return;
      }

      setCapabilities(report);

      const creationOrder: FeatureTier[] = [];
      if (report.webgpu.available) {
        creationOrder.push('webgpu');
      }
      if (report.webgl2.available) {
        creationOrder.push('webgl2');
      }
      creationOrder.push('static');

      for (const tier of creationOrder) {
        if (tier === 'static') {
          activeTierRef.current = 'static';
          setActiveTier('static');
          break;
        }

        const success = await tryCreate(tier);
        if (success) {
          break;
        }
      }

      if (activeTierRef.current !== 'static') {
        resizeObserver = new ResizeObserver(() => applyResize());
        resizeObserver.observe(container);
      }
    };

    void init();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      destroyRenderer();
    };
  }, [createWebGL2, createWebGPU]);

  const updatePointer = (event: ReactPointerEvent<HTMLDivElement>, pointerDown: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = 1 - ((event.clientY - rect.top) / rect.height) * 2;

    controlStateRef.current = {
      ...controlStateRef.current,
      pointerX: Number.isFinite(normalizedX) ? normalizedX : 0,
      pointerY: Number.isFinite(normalizedY) ? normalizedY : 0,
      pointerDown,
    };

    rendererRef.current?.updateControlState(controlStateRef.current);
  };

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative h-[68vh] min-h-[460px] overflow-hidden rounded-2xl border border-white/15 bg-black"
        onPointerDown={(event) => {
          (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
          updatePointer(event, true);
        }}
        onPointerMove={(event) => updatePointer(event, controlStateRef.current.pointerDown)}
        onPointerUp={(event) => updatePointer(event, false)}
        onPointerLeave={(event) => updatePointer(event, false)}
      >
        <canvas ref={canvasRef} className="h-full w-full" />

        {activeTier === 'static' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/95 p-6">{staticFallback}</div>
        ) : null}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(2,6,23,0.62),transparent_38%)]" />

        <div className="absolute left-4 top-4 rounded-xl border border-white/20 bg-slate-900/75 px-4 py-3 text-xs text-slate-200 backdrop-blur">
          <p className="font-mono uppercase tracking-[0.2em] text-cyan-300">Compatibility</p>
          <p className="mt-1">{compatibilityLabel}</p>
          <p>Tier: {activeTier.toUpperCase()}</p>
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-3">
          <label className="flex w-full max-w-md flex-col gap-1 rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 backdrop-blur sm:w-auto sm:min-w-[300px]">
            <span className="font-mono uppercase tracking-[0.2em] text-cyan-300">Prompt Influence</span>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g., tighter swirl, higher energy"
              className="rounded-md border border-white/15 bg-slate-800/80 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-300"
              maxLength={80}
            />
          </label>

          <button
            type="button"
            onClick={() => setShowDiagnostics((current) => !current)}
            className="inline-flex items-center rounded-full border border-white/25 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-800"
          >
            Diagnostics ({showDiagnostics ? 'Hide' : 'Show'})
          </button>
        </div>

        {showDiagnostics ? (
          <div className="absolute right-4 top-4 w-72 rounded-xl border border-cyan-300/30 bg-slate-950/90 p-4 text-xs text-slate-200 backdrop-blur">
            <p className="font-mono uppercase tracking-[0.2em] text-cyan-300">Performance</p>
            <p className="mt-2">FPS: {diagnostics.fps}</p>
            <p>Frame time: {diagnostics.frameTime.toFixed(2)} ms</p>
            <p className="mt-2 font-mono uppercase tracking-[0.2em] text-cyan-300">Capabilities</p>
            <p>navigator.gpu: {capabilities?.hasNavigatorGpu ? 'yes' : 'no'}</p>
            <p>WebGPU: {capabilities?.webgpu.available ? 'yes' : 'no'}</p>
            <p>WebGL2: {capabilities?.webgl2.available ? 'yes' : 'no'}</p>
            <p className="mt-2">Adapter: {capabilities?.webgpu.adapterName ?? 'n/a'}</p>
            <p>Vendor: {capabilities?.webgpu.vendor ?? 'n/a'}</p>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-slate-500">Press the <span className="font-mono text-slate-300">P</span> key to toggle diagnostics.</p>
    </div>
  );
}
