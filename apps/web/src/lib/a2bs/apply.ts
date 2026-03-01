import type { BlendshapeMap } from './smoothing';

export type AvatarExpressionTargets = {
  jawOpen: number;
  mouthSmile: number;
  mouthFunnel: number;
  mouthPucker: number;
};

export type AvatarExpressionRig = {
  setExpression: (weights: AvatarExpressionTargets) => void;
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

function pickMax(input: BlendshapeMap, ...keys: string[]): number {
  let maxValue = 0;
  for (const key of keys) {
    maxValue = Math.max(maxValue, input[key] ?? 0);
  }
  return clamp01(maxValue);
}

export function mapBlendshapesToAvatarExpression(input: BlendshapeMap): AvatarExpressionTargets {
  const jawOpen = pickMax(input, 'jawOpen');
  const smileLeft = pickMax(input, 'mouthSmileLeft');
  const smileRight = pickMax(input, 'mouthSmileRight');
  const mouthSmile = clamp01((smileLeft + smileRight) * 0.5);
  const mouthFunnel = pickMax(input, 'mouthFunnel');
  const mouthPucker = pickMax(input, 'mouthPucker');

  return {
    jawOpen,
    mouthSmile,
    mouthFunnel,
    mouthPucker,
  };
}

export function applyBlendshapesToRig(
  rig: AvatarExpressionRig | null | undefined,
  blendshapes: BlendshapeMap,
): AvatarExpressionTargets {
  const mapped = mapBlendshapesToAvatarExpression(blendshapes);
  rig?.setExpression(mapped);
  return mapped;
}
