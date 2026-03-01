'use client';

import { useEffect, useRef, useState } from 'react';

import { Pause, Play } from 'lucide-react';
import * as THREE from 'three';

import { Card } from '@/components/Card';
import { createBestRenderer, type RendererMode, type UnifiedRenderer } from '@/lib/three/createRenderer';

const PARTICLE_COUNT = 2200;
const BOUNDS = 3.2;

export default function WebGpuParticlesDemo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);

  const [isPaused, setIsPaused] = useState(false);
  const [fps, setFps] = useState(0);
  const [rendererMode, setRendererMode] = useState<RendererMode>('webgl');

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    let renderer: UnifiedRenderer | null = null;
    let scene: any = null;
    let camera: any = null;
    let mesh: any = null;

    let frameCounter = 0;
    let fpsWindowStart = 0;
    let disposed = false;

    const cleanupCallbacks: Array<() => void> = [];

    const init = async () => {
      const result = await createBestRenderer(canvas);
      if (disposed) {
        result.renderer.dispose();
        return;
      }

      renderer = result.renderer;
      setRendererMode(result.mode);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2('#020617', 0.18);

      camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
      camera.position.set(0, 1.2, 6.4);

      const ambient = new THREE.AmbientLight('#8ec5ff', 0.8);
      const key = new THREE.DirectionalLight('#22d3ee', 1.4);
      key.position.set(2.5, 4.0, 3.5);
      scene.add(ambient, key);

      const geometry = new THREE.IcosahedronGeometry(0.03, 0);
      const material = new THREE.MeshStandardMaterial({
        color: '#67e8f9',
        emissive: '#155e75',
        roughness: 0.28,
        metalness: 0.12,
      });

      mesh = new THREE.InstancedMesh(geometry, material, PARTICLE_COUNT);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);

      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const speeds = new Float32Array(PARTICLE_COUNT);
      const offsets = new Float32Array(PARTICLE_COUNT);

      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const i3 = i * 3;
        positions[i3] = (Math.random() - 0.5) * BOUNDS * 2;
        positions[i3 + 1] = (Math.random() - 0.5) * BOUNDS * 2;
        positions[i3 + 2] = (Math.random() - 0.5) * BOUNDS * 2;
        speeds[i] = 0.002 + Math.random() * 0.01;
        offsets[i] = Math.random() * Math.PI * 2;
      }

      const dummy = new THREE.Object3D();

      const resize = () => {
        if (!camera || !renderer || !container) {
          return;
        }

        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };

      resize();
      window.addEventListener('resize', resize);
      cleanupCallbacks.push(() => window.removeEventListener('resize', resize));

      const animate = (time: number) => {
        if (!renderer || !scene || !camera || !mesh || disposed) {
          return;
        }

        if (!pausedRef.current) {
          const t = time * 0.001;

          for (let i = 0; i < PARTICLE_COUNT; i += 1) {
            const i3 = i * 3;
            const offset = offsets[i] ?? 0;
            const nextY = (positions[i3 + 1] ?? 0) + (speeds[i] ?? 0);
            const nextX = (positions[i3] ?? 0) + Math.sin(t * 0.6 + offset) * 0.0008;
            const nextZ = (positions[i3 + 2] ?? 0) + Math.cos(t * 0.7 + offset) * 0.0008;
            positions[i3] = nextX;
            positions[i3 + 1] = nextY;
            positions[i3 + 2] = nextZ;

            if ((positions[i3 + 1] ?? 0) > BOUNDS) {
              positions[i3 + 1] = -BOUNDS;
            }

            dummy.position.set(positions[i3] ?? 0, positions[i3 + 1] ?? 0, positions[i3 + 2] ?? 0);
            dummy.scale.setScalar(0.8 + Math.sin(t + offset) * 0.25);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
          }

          mesh.instanceMatrix.needsUpdate = true;
          mesh.rotation.y += 0.0008;
        }

        renderer.render(scene, camera);

        frameCounter += 1;
        if (fpsWindowStart === 0) {
          fpsWindowStart = time;
        }

        const elapsed = time - fpsWindowStart;
        if (elapsed > 500) {
          setFps(Math.round((frameCounter * 1000) / elapsed));
          frameCounter = 0;
          fpsWindowStart = time;
        }
      };

      renderer.setAnimationLoop?.(animate);

      cleanupCallbacks.push(() => {
        renderer?.setAnimationLoop?.(null);
        geometry.dispose();
        material.dispose();
      });
    };

    void init();

    return () => {
      disposed = true;
      cleanupCallbacks.forEach((fn) => fn());
      renderer?.dispose();
      scene = null;
      camera = null;
      mesh = null;
    };
  }, []);

  return (
    <Card className="overflow-hidden p-0">
      <div ref={containerRef} className="relative h-[72vh] min-h-[460px] w-full">
        <canvas ref={canvasRef} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-slate-900/20" />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <div className="rounded-xl border border-white/15 bg-slate-900/75 px-4 py-3 text-xs text-slate-200 backdrop-blur">
            <p className="font-mono uppercase tracking-[0.2em] text-cyan-300">Renderer</p>
            <p className="mt-1">{rendererMode === 'webgpu' ? 'WebGPU active' : 'WebGL fallback'}</p>
            <p>Particles: {PARTICLE_COUNT.toLocaleString()}</p>
            <p>FPS-ish: {fps}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsPaused((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-900/80 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-800"
          >
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>
    </Card>
  );
}
