import { WebGPURenderer } from '@/lib/vendor/three';

import type { HostControlState, RendererControl, RendererHooks } from '@xrb/lab-core';

import { createAvatarRig, type ExpressionWeights } from './avatarRig';

type AudioLevelGetter = () => number;
type ExpressionGetter = () => Partial<ExpressionWeights> | null;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export async function createWebGPUAvatarRenderer(
  canvas: HTMLCanvasElement,
  hooks: RendererHooks,
  getAudioLevel: AudioLevelGetter,
  getExternalExpression?: ExpressionGetter,
): Promise<RendererControl> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true,
  }) as any;

  if (typeof renderer.init === 'function') {
    await renderer.init();
  }

  const rig = await createAvatarRig();

  let width = 1;
  let height = 1;
  let dpr = 1;
  let running = false;
  let frameHandle = 0;
  let controlState: HostControlState = {
    pointerX: 0,
    pointerY: 0,
    pointerDown: false,
    prompt: '',
  };

  let lastFrame = performance.now();
  let smoothedMouth = 0;

  const resize = () => {
    renderer.setPixelRatio(Math.max(1, dpr));
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    rig.camera.aspect = Math.max(1, width) / Math.max(1, height);
    rig.camera.updateProjectionMatrix();
  };

  const tick = (timestamp: number) => {
    if (!running) {
      return;
    }

    const frameStart = performance.now();
    const dt = Math.min((timestamp - lastFrame) / 1000, 0.05);
    lastFrame = timestamp;

    const externalExpression = getExternalExpression?.();
    const hasExternalExpression =
      Boolean(externalExpression) &&
      Object.values(externalExpression ?? {}).some((value) => typeof value === 'number' && Number.isFinite(value));

    const targetMouth = Math.min(Math.max(getAudioLevel() * 2.6, 0.03), 1);
    smoothedMouth = smoothedMouth * 0.82 + targetMouth * 0.18;

    const promptBias = clamp01(controlState.prompt.trim().length / 48);
    const visemePhase = Math.sin(timestamp * 0.011 + controlState.prompt.length * 0.045) * 0.5 + 0.5;
    const generatedJawOpen = clamp01(smoothedMouth * (0.78 + visemePhase * 0.24));
    const generatedMouthFunnel = clamp01(smoothedMouth * (0.24 + (1 - visemePhase) * 0.56));
    const generatedMouthPucker = clamp01(smoothedMouth * (0.15 + visemePhase * 0.42));
    const generatedMouthSmile = clamp01(
      smoothedMouth * (0.12 + promptBias * 0.38 + (Math.sin(timestamp * 0.006 + 1.2) * 0.5 + 0.5) * 0.28),
    );

    const jawOpen = hasExternalExpression ? clamp01(externalExpression?.jawOpen ?? 0) : generatedJawOpen;
    const mouthFunnel = hasExternalExpression ? clamp01(externalExpression?.mouthFunnel ?? 0) : generatedMouthFunnel;
    const mouthPucker = hasExternalExpression ? clamp01(externalExpression?.mouthPucker ?? 0) : generatedMouthPucker;
    const mouthSmile = hasExternalExpression ? clamp01(externalExpression?.mouthSmile ?? 0) : generatedMouthSmile;

    rig.setExpression({
      jawOpen,
      mouthSmile,
      mouthFunnel,
      mouthPucker,
    });

    const pointerLocked = rig.disablePointerInfluence;
    const sway = pointerLocked ? 0 : Math.sin(timestamp * 0.0012) * 0.04;
    const pointerX = pointerLocked ? 0 : controlState.pointerX;
    const pointerY = pointerLocked ? 0 : controlState.pointerY;
    rig.head.rotation.y = sway + pointerX * 0.18;
    rig.head.rotation.x = (pointerLocked ? 0 : -0.06) + pointerY * 0.12;
    rig.head.position.y = pointerLocked ? 0.28 : 0.28 + Math.sin(timestamp * 0.0015) * 0.015;

    renderer.render(rig.scene, rig.camera);

    hooks.onFrameSample(performance.now() - frameStart);
    frameHandle = requestAnimationFrame(tick);
    void dt;
  };

  return {
    start: () => {
      if (running) {
        return;
      }

      running = true;
      lastFrame = performance.now();
      frameHandle = requestAnimationFrame(tick);
    },
    stop: () => {
      running = false;
      if (frameHandle) {
        cancelAnimationFrame(frameHandle);
      }
      frameHandle = 0;
    },
    resize: (nextWidth: number, nextHeight: number, nextDpr: number) => {
      width = nextWidth;
      height = nextHeight;
      dpr = nextDpr;
      resize();
    },
    updateControlState: (nextState: HostControlState) => {
      controlState = nextState;
    },
    dispose: () => {
      running = false;
      if (frameHandle) {
        cancelAnimationFrame(frameHandle);
      }
      rig.dispose();
      renderer.dispose?.();
    },
  };
}
