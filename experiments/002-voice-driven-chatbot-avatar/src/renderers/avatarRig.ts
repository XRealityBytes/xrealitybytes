import { OBJLoader, THREE } from '@/lib/vendor/three';

type ThreeScene = InstanceType<typeof THREE.Scene>;
type ThreePerspectiveCamera = InstanceType<typeof THREE.PerspectiveCamera>;
type ThreeGroup = InstanceType<typeof THREE.Group>;
type ThreeMesh = InstanceType<typeof THREE.Mesh>;
type ThreeBufferGeometry = InstanceType<typeof THREE.BufferGeometry>;
type ThreeBufferAttribute = InstanceType<typeof THREE.BufferAttribute>;
type ThreeMaterial = InstanceType<typeof THREE.Material>;
type ThreeObject3D = InstanceType<typeof THREE.Object3D>;
type ThreeVector3 = InstanceType<typeof THREE.Vector3>;

export type ExpressionWeights = {
  jawOpen: number;
  mouthSmile: number;
  mouthFunnel: number;
  mouthPucker: number;
};

type MorphTargetSlots = {
  jawOpen: number[];
  mouthSmile: number[];
  mouthFunnel: number[];
  mouthPucker: number[];
};

type FaceKitVertexIndexPayload = {
  idx_to_landmark_verts?: unknown;
};

export type AvatarRig = {
  scene: ThreeScene;
  camera: ThreePerspectiveCamera;
  head: ThreeGroup;
  mouth: ThreeMesh;
  disablePointerInfluence: boolean;
  setExpression: (weights: ExpressionWeights) => void;
  dispose: () => void;
};

const ASSET_ROOT = '/experiments/002-voice-driven-chatbot-avatar/ict-facekit';
const NEUTRAL_MESH_URL = `${ASSET_ROOT}/generic_neutral_mesh.obj`;
const JAW_OPEN_URL = `${ASSET_ROOT}/jawOpen.obj`;
const MOUTH_FUNNEL_URL = `${ASSET_ROOT}/mouthFunnel.obj`;
const MOUTH_PUCKER_URL = `${ASSET_ROOT}/mouthPucker.obj`;
const MOUTH_SMILE_LEFT_URL = `${ASSET_ROOT}/mouthSmile_L.obj`;
const MOUTH_SMILE_RIGHT_URL = `${ASSET_ROOT}/mouthSmile_R.obj`;
const VERTEX_INDICES_URL = `${ASSET_ROOT}/vertex_indices.json`;

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

function createSceneScaffold(): {
  scene: ThreeScene;
  camera: ThreePerspectiveCamera;
  head: ThreeGroup;
} {
  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 24);

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2.3, 3.2, 3.6);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8ab4ff, 0.45);
  fill.position.set(-2.5, 2.2, 2.8);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x55ffd6, 0.22);
  rim.position.set(0, 1.4, -3.5);
  scene.add(rim);

  const ambient = new THREE.AmbientLight(0x94a3b8, 0.28);
  scene.add(ambient);

  const head = new THREE.Group();
  head.position.set(0, 0.28, 0);
  scene.add(head);

  return { scene, camera, head };
}

async function loadObjMesh(url: string): Promise<ThreeMesh> {
  const loader = new OBJLoader();

  return await new Promise<ThreeMesh>((resolve, reject) => {
    loader.load(
      url,
      (object) => {
        let found: ThreeMesh | null = null;

        object.traverse((child: ThreeObject3D) => {
          if (!found && child instanceof THREE.Mesh) {
            found = child;
          }
        });

        if (!found) {
          reject(new Error(`OBJ has no mesh payload: ${url}`));
          return;
        }

        resolve(found);
      },
      undefined,
      (error) => reject(error),
    );
  });
}

async function loadFaceKitLandmarkIndices(): Promise<number[] | null> {
  try {
    const response = await fetch(VERTEX_INDICES_URL, { cache: 'force-cache' });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as FaceKitVertexIndexPayload;
    if (!Array.isArray(payload.idx_to_landmark_verts)) {
      return null;
    }

    const clean = payload.idx_to_landmark_verts.filter(
      (value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0,
    );

    return clean.length >= 48 ? clean : null;
  } catch {
    return null;
  }
}

function extractPositionAttribute(geometry: ThreeBufferGeometry): ThreeBufferAttribute {
  const attribute = geometry.getAttribute('position');
  if (!(attribute instanceof THREE.BufferAttribute)) {
    throw new Error('Geometry is missing a position attribute.');
  }
  return attribute;
}

function appendMorphTarget(
  targetPool: ThreeBufferAttribute[],
  basePositions: ThreeBufferAttribute,
  targetPositions: ThreeBufferAttribute,
): number {
  if (basePositions.count !== targetPositions.count || basePositions.itemSize !== targetPositions.itemSize) {
    throw new Error('Morph target vertex layout mismatch.');
  }

  targetPool.push(targetPositions.clone());
  return targetPool.length - 1;
}

function averageVertexPosition(
  positions: ThreeBufferAttribute,
  indices: number[],
  fallback: ThreeVector3,
): ThreeVector3 {
  if (indices.length === 0) {
    return fallback.clone();
  }

  const accumulator = new THREE.Vector3();
  let count = 0;

  for (const candidate of indices) {
    if (candidate < 0 || candidate >= positions.count) {
      continue;
    }

    accumulator.x += positions.getX(candidate);
    accumulator.y += positions.getY(candidate);
    accumulator.z += positions.getZ(candidate);
    count += 1;
  }

  if (count === 0) {
    return fallback.clone();
  }

  return accumulator.multiplyScalar(1 / count);
}

function applyExpressionToMorphTargets(
  mouth: ThreeMesh,
  slots: MorphTargetSlots,
  weights: ExpressionWeights,
): void {
  const influences = mouth.morphTargetInfluences;
  if (!influences) {
    return;
  }

  const setSlots = (indices: number[], value: number) => {
    for (const index of indices) {
      if (index >= 0 && index < influences.length) {
        influences[index] = value;
      }
    }
  };

  setSlots(slots.jawOpen, clamp01(weights.jawOpen));
  setSlots(slots.mouthSmile, clamp01(weights.mouthSmile));
  setSlots(slots.mouthFunnel, clamp01(weights.mouthFunnel));
  setSlots(slots.mouthPucker, clamp01(weights.mouthPucker));
}

async function createFaceKitRig(): Promise<AvatarRig> {
  const { scene, camera, head } = createSceneScaffold();

  const [neutralMesh, jawOpenMesh, mouthFunnelMesh, mouthPuckerMesh, mouthSmileLeftMesh, mouthSmileRightMesh, landmarks] =
    await Promise.all([
      loadObjMesh(NEUTRAL_MESH_URL),
      loadObjMesh(JAW_OPEN_URL),
      loadObjMesh(MOUTH_FUNNEL_URL),
      loadObjMesh(MOUTH_PUCKER_URL),
      loadObjMesh(MOUTH_SMILE_LEFT_URL),
      loadObjMesh(MOUTH_SMILE_RIGHT_URL),
      loadFaceKitLandmarkIndices(),
    ]);

  const neutralGeometry = neutralMesh.geometry.clone();
  const basePositions = extractPositionAttribute(neutralGeometry);

  const morphTargets: ThreeBufferAttribute[] = [];

  const slots: MorphTargetSlots = {
    jawOpen: [],
    mouthSmile: [],
    mouthFunnel: [],
    mouthPucker: [],
  };

  slots.jawOpen.push(
    appendMorphTarget(morphTargets, basePositions, extractPositionAttribute(jawOpenMesh.geometry)),
  );
  slots.mouthFunnel.push(
    appendMorphTarget(morphTargets, basePositions, extractPositionAttribute(mouthFunnelMesh.geometry)),
  );
  slots.mouthPucker.push(
    appendMorphTarget(morphTargets, basePositions, extractPositionAttribute(mouthPuckerMesh.geometry)),
  );
  slots.mouthSmile.push(
    appendMorphTarget(morphTargets, basePositions, extractPositionAttribute(mouthSmileLeftMesh.geometry)),
  );
  slots.mouthSmile.push(
    appendMorphTarget(morphTargets, basePositions, extractPositionAttribute(mouthSmileRightMesh.geometry)),
  );

  neutralGeometry.morphAttributes.position = morphTargets;
  neutralGeometry.morphTargetsRelative = false;
  neutralGeometry.computeVertexNormals();
  neutralGeometry.computeBoundingBox();

  const material = new THREE.MeshStandardMaterial({
    color: 0xdbe5f6,
    roughness: 0.58,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });

  const mouth = new THREE.Mesh(neutralGeometry, material);
  mouth.updateMorphTargets();

  const bounds = neutralGeometry.boundingBox;
  const fallbackEyePoint = bounds
    ? new THREE.Vector3(
        (bounds.min.x + bounds.max.x) * 0.5,
        bounds.min.y + (bounds.max.y - bounds.min.y) * 0.62,
        bounds.min.z + (bounds.max.z - bounds.min.z) * 0.84,
      )
    : new THREE.Vector3(0, 2.8, 8.5);

  const eyeLandmarkIndices = landmarks ? landmarks.slice(36, 48) : [];
  const eyePointModel = averageVertexPosition(basePositions, eyeLandmarkIndices, fallbackEyePoint);

  const meshHeight = bounds ? Math.max(bounds.max.y - bounds.min.y, 1e-4) : 33;
  const targetHeadHeight = 0.92;
  const scale = targetHeadHeight / meshHeight;
  mouth.scale.setScalar(scale);

  mouth.rotation.set(0, 0, 0);
  head.add(mouth);

  const eyePointWorld = eyePointModel.multiplyScalar(scale).add(head.position.clone());
  const cameraDistance = 0.94;

  camera.position.set(eyePointWorld.x, eyePointWorld.y + 0.01, eyePointWorld.z + cameraDistance);
  camera.lookAt(eyePointWorld);
  camera.updateProjectionMatrix();

  const setExpression = (weights: ExpressionWeights) => {
    applyExpressionToMorphTargets(mouth, slots, weights);
  };

  return {
    scene,
    camera,
    head,
    mouth,
    disablePointerInfluence: true,
    setExpression,
    dispose: () => {
      neutralGeometry.dispose();
      material.dispose();
    },
  };
}

function createProceduralFallbackRig(): AvatarRig {
  const { scene, camera, head } = createSceneScaffold();

  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8c9df,
    roughness: 0.56,
    metalness: 0.02,
  });
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 48, 48), headMaterial);
  headMesh.position.set(0, 0, 0);
  head.add(headMesh);

  const mouthMaterial = new THREE.MeshBasicMaterial({
    color: 0x1f2937,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  });
  const mouthGeometry = new THREE.PlaneGeometry(0.12, 0.055, 1, 1);
  const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
  mouth.position.set(0, -0.07, 0.315);
  head.add(mouth);

  const leftEye = new THREE.Mesh(
    new THREE.SphereGeometry(0.024, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x0f172a }),
  );
  leftEye.position.set(-0.09, 0.08, 0.29);
  head.add(leftEye);

  const rightEye = leftEye.clone();
  rightEye.position.x = 0.09;
  head.add(rightEye);

  const eyePointWorld = new THREE.Vector3(0, head.position.y + 0.08, 0.29);
  camera.position.set(0, eyePointWorld.y + 0.02, eyePointWorld.z + 0.9);
  camera.lookAt(eyePointWorld);
  camera.updateProjectionMatrix();

  const setExpression = (weights: ExpressionWeights) => {
    const jaw = clamp01(weights.jawOpen);
    const smile = clamp01(weights.mouthSmile);
    const funnel = clamp01(weights.mouthFunnel);
    const pucker = clamp01(weights.mouthPucker);

    const width = 1 + smile * 0.45 - (funnel * 0.3 + pucker * 0.24);
    const height = 1 + jaw * 2.15 + funnel * 0.42;
    mouth.scale.set(Math.max(0.55, width), Math.max(0.6, height), 1);
    mouth.position.y = -0.072 - jaw * 0.03;
  };

  return {
    scene,
    camera,
    head,
    mouth,
    disablePointerInfluence: false,
    setExpression,
    dispose: () => {
      headGeometryDispose(headMesh.geometry);
      headMaterial.dispose();
      mouthGeometry.dispose();
      mouthMaterial.dispose();
      leftEye.geometry.dispose();
      (leftEye.material as ThreeMaterial).dispose();
      rightEye.geometry.dispose();
      (rightEye.material as ThreeMaterial).dispose();
    },
  };
}

function headGeometryDispose(geometry: ThreeBufferGeometry): void {
  geometry.dispose();
}

export async function createAvatarRig(): Promise<AvatarRig> {
  try {
    return await createFaceKitRig();
  } catch {
    return createProceduralFallbackRig();
  }
}
