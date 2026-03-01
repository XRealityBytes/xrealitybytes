'use client';

import Image from 'next/image';

import { GpuCanvasHost } from '@/components/lab/GpuCanvasHost';

import { createWebGL2ParticleRenderer } from '@experiments/001-particle-field/src/renderers/webgl2';
import { createWebGPUParticleRenderer } from '@experiments/001-particle-field/src/renderers/webgpu';

export default function ParticleFieldExperiment() {
  return (
    <GpuCanvasHost
      createWebGPU={createWebGPUParticleRenderer}
      createWebGL2={createWebGL2ParticleRenderer}
      staticFallback={
        <div className="grid gap-4 text-center text-sm text-slate-300">
          <Image
            src="/experiments/001-particle-field/poster.svg"
            alt="Particle field static fallback"
            width={900}
            height={520}
            className="h-auto w-full max-w-3xl rounded-xl border border-white/10"
          />
          <div className="space-y-1">
            <p className="font-medium text-slate-100">WebGPU and WebGL2 are unavailable on this browser/device.</p>
            <p>
              You are seeing static compatibility mode. The experiment remains accessible so navigation and content
              never break.
            </p>
          </div>
        </div>
      }
    />
  );
}
