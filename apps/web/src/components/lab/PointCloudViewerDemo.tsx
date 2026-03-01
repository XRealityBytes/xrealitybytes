'use client';

import { useEffect, useRef, useState } from 'react';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { Card } from '@/components/Card';
import { createBestRenderer, type RendererMode, type UnifiedRenderer } from '@/lib/three/createRenderer';

type PointTuple = [number, number, number, number];

type PointData = {
  points: PointTuple[];
};

const INITIAL_POINT_SIZE = 0.03;

function generateFallbackPoints(count = 1400): PointTuple[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * 0.08;
    const radius = 0.45 + ((index % 220) / 220) * 1.6;
    const x = Math.cos(angle) * radius;
    const y = ((index % 120) - 60) / 120;
    const z = Math.sin(angle) * radius;
    const intensity = 0.25 + ((index % 16) / 16) * 0.75;

    return [x, y, z, intensity];
  });
}

export default function PointCloudViewerDemo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const materialRef = useRef<any>(null);

  const [rendererMode, setRendererMode] = useState<RendererMode>('webgl');
  const [pointSize, setPointSize] = useState(INITIAL_POINT_SIZE);
  const [pointCount, setPointCount] = useState(0);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.size = pointSize;
    }
  }, [pointSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    let renderer: UnifiedRenderer | null = null;
    let scene: any = null;
    let camera: any = null;
    let controls: any = null;

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
      scene.background = new THREE.Color('#020617');
      scene.fog = new THREE.Fog('#020617', 2.8, 7.8);

      camera = new THREE.PerspectiveCamera(60, 1, 0.01, 50);
      camera.position.set(1.8, 1.1, 2.8);

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.minDistance = 0.8;
      controls.maxDistance = 7.5;

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

      let data: PointData;
      try {
        const response = await fetch('/demos/pointcloud-sample.json');
        if (!response.ok) {
          throw new Error(`Dataset request failed with status ${response.status}`);
        }
        data = (await response.json()) as PointData;
      } catch (error) {
        console.warn('Falling back to generated point cloud dataset.', error);
        data = { points: generateFallbackPoints() };
      }

      const points = data.points.length > 0 ? data.points : generateFallbackPoints();
      setPointCount(points.length);

      const positions = new Float32Array(points.length * 3);
      const colors = new Float32Array(points.length * 3);

      points.forEach(([x, y, z, intensity], index) => {
        const i3 = index * 3;
        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;

        colors[i3] = 0.15 + intensity * 0.5;
        colors[i3 + 1] = 0.35 + intensity * 0.6;
        colors[i3 + 2] = 0.55 + intensity * 0.35;
      });

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: INITIAL_POINT_SIZE,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      materialRef.current = material;

      const cloud = new THREE.Points(geometry, material);
      scene.add(cloud);

      const grid = new THREE.GridHelper(8, 24, '#164e63', '#0f172a');
      grid.position.y = -1.1;
      scene.add(grid);

      const animate = (time: number) => {
        if (!renderer || !scene || !camera || !controls || disposed) {
          return;
        }

        const t = time * 0.0004;
        cloud.rotation.y = t;
        controls.update();
        renderer.render(scene, camera);
      };

      renderer.setAnimationLoop?.(animate);

      cleanupCallbacks.push(() => {
        renderer?.setAnimationLoop?.(null);
        geometry.dispose();
        material.dispose();
        grid.geometry.dispose();
        if (Array.isArray(grid.material)) {
          grid.material.forEach((materialInstance: any) => materialInstance.dispose());
        } else {
          grid.material.dispose();
        }
      });
    };

    void init();

    return () => {
      disposed = true;
      cleanupCallbacks.forEach((fn) => fn());
      controls?.dispose();
      renderer?.dispose();
      materialRef.current = null;
      scene = null;
      camera = null;
      controls = null;
    };
  }, []);

  return (
    <Card className="overflow-hidden p-0">
      <div ref={containerRef} className="relative h-[72vh] min-h-[460px] w-full">
        <canvas ref={canvasRef} className="h-full w-full" />
        <div className="absolute left-4 top-4 rounded-xl border border-white/15 bg-slate-900/75 px-4 py-3 text-xs text-slate-200 backdrop-blur sm:left-6 sm:top-6">
          <p className="font-mono uppercase tracking-[0.2em] text-cyan-300">Renderer</p>
          <p className="mt-1">{rendererMode === 'webgpu' ? 'WebGPU active' : 'WebGL fallback'}</p>
          <p>Points: {pointCount.toLocaleString()}</p>
        </div>
        <div className="absolute bottom-4 right-4 w-60 rounded-xl border border-white/15 bg-slate-900/75 px-4 py-3 text-xs text-slate-200 backdrop-blur sm:bottom-6 sm:right-6">
          <label htmlFor="point-size" className="mb-2 block font-mono uppercase tracking-[0.2em] text-cyan-300">
            Point size
          </label>
          <input
            id="point-size"
            type="range"
            min={0.01}
            max={0.08}
            step={0.005}
            value={pointSize}
            onChange={(event) => setPointSize(Number(event.target.value))}
            className="w-full accent-cyan-300"
          />
          <p className="mt-1">{pointSize.toFixed(3)}</p>
        </div>
      </div>
    </Card>
  );
}
