import type { HostControlState, RendererControl, RendererHooks } from '@xrb/lab-core';

const PARTICLE_COUNT = 12_288;
const WORKGROUP_SIZE = 64;
const GPU_BUFFER_USAGE_UNIFORM = 0x0040;
const GPU_BUFFER_USAGE_STORAGE = 0x0080;
const GPU_BUFFER_USAGE_COPY_DST = 0x0008;

type SimulationParams = {
  mouseX: number;
  mouseY: number;
  pointerDown: number;
  promptEnergy: number;
  deltaTime: number;
  time: number;
};

function initialParticles(): Float32Array {
  const particles = new Float32Array(PARTICLE_COUNT * 4);

  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const i4 = i * 4;
    const theta = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * 0.92;

    particles[i4] = Math.cos(theta) * radius;
    particles[i4 + 1] = Math.sin(theta) * radius;
    particles[i4 + 2] = (Math.random() - 0.5) * 0.01;
    particles[i4 + 3] = (Math.random() - 0.5) * 0.01;
  }

  return particles;
}

function promptToEnergy(prompt: string): number {
  if (!prompt.trim()) {
    return 0.22;
  }

  let hash = 0;
  for (let i = 0; i < prompt.length; i += 1) {
    hash = (hash + prompt.charCodeAt(i) * (i + 1)) % 997;
  }

  const normalizedLength = Math.min(prompt.length / 64, 1);
  return 0.35 + normalizedLength * 0.8 + (hash / 997) * 0.45;
}

function buildComputeShader(): string {
  return `
struct Particle {
  position : vec2f,
  velocity : vec2f,
}

struct SimParams {
  mouse : vec2f,
  pointer_down : f32,
  prompt_energy : f32,
  delta_time : f32,
  elapsed_time : f32,
  pad0 : vec2f,
}

@group(0) @binding(0) var<storage, read> source_particles : array<Particle>;
@group(0) @binding(1) var<storage, read_write> target_particles : array<Particle>;
@group(0) @binding(2) var<uniform> params : SimParams;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let index = gid.x;
  if (index >= ${PARTICLE_COUNT}u) {
    return;
  }

  var particle = source_particles[index];

  let to_mouse = params.mouse - particle.position;
  let distance = max(length(to_mouse), 0.002);

  let pointer_force = normalize(to_mouse) * params.pointer_down * params.prompt_energy * 0.0012 / (0.08 + distance * distance);
  let swirl = vec2f(-particle.position.y, particle.position.x) * (0.0005 + params.prompt_energy * 0.0007);

  particle.velocity = particle.velocity + pointer_force + swirl;
  particle.velocity = particle.velocity * 0.989;
  particle.position = particle.position + particle.velocity * max(params.delta_time, 0.001) * 60.0;

  if (particle.position.x > 1.0 || particle.position.x < -1.0) {
    particle.velocity.x = -particle.velocity.x;
    particle.position.x = clamp(particle.position.x, -1.0, 1.0);
  }

  if (particle.position.y > 1.0 || particle.position.y < -1.0) {
    particle.velocity.y = -particle.velocity.y;
    particle.position.y = clamp(particle.position.y, -1.0, 1.0);
  }

  target_particles[index] = particle;
}
`;
}

function buildRenderShader(): string {
  return `
struct Particle {
  position : vec2f,
  velocity : vec2f,
}

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) speed : f32,
}

@group(0) @binding(0) var<storage, read> particles : array<Particle>;

@vertex
fn vertexMain(@builtin(vertex_index) index : u32) -> VertexOut {
  var out : VertexOut;
  let particle = particles[index];
  out.position = vec4f(particle.position.xy, 0.0, 1.0);
  out.speed = clamp(length(particle.velocity) * 14.0, 0.0, 1.0);
  return out;
}

@fragment
fn fragmentMain(@location(0) speed : f32) -> @location(0) vec4f {
  let low = vec3f(0.08, 0.32, 0.58);
  let high = vec3f(0.20, 0.93, 0.99);
  let color = mix(low, high, speed);
  return vec4f(color, 0.82);
}
`;
}

export async function createWebGPUParticleRenderer(
  canvas: HTMLCanvasElement,
  hooks: RendererHooks,
): Promise<RendererControl> {
  const navigatorWithGpu = navigator as Navigator & {
    gpu?: {
      requestAdapter: () => Promise<{
        requestDevice: () => Promise<{
          createBuffer: (...args: unknown[]) => any;
          createShaderModule: (...args: unknown[]) => any;
          createComputePipelineAsync: (...args: unknown[]) => Promise<any>;
          createRenderPipelineAsync: (...args: unknown[]) => Promise<any>;
          createBindGroup: (...args: unknown[]) => any;
          createCommandEncoder: (...args: unknown[]) => any;
          queue: {
            writeBuffer: (...args: unknown[]) => void;
            submit: (...args: unknown[]) => void;
          };
        }>;
      } | null>;
      getPreferredCanvasFormat: () => string;
    };
  };

  const gpu = navigatorWithGpu.gpu;
  if (!gpu) {
    throw new Error('navigator.gpu is unavailable.');
  }

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to request GPU adapter.');
  }

  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu') as
    | {
        configure: (config: { device: unknown; format: string; alphaMode: 'premultiplied' }) => void;
        getCurrentTexture: () => { createView: () => unknown };
      }
    | null;
  if (!context) {
    throw new Error('Failed to acquire webgpu canvas context.');
  }

  const presentationFormat = gpu.getPreferredCanvasFormat();

  const bytesPerParticle = 4 * Float32Array.BYTES_PER_ELEMENT;
  const bufferSize = PARTICLE_COUNT * bytesPerParticle;

  const initialData = initialParticles();

  const particleA = device.createBuffer({
    label: 'particle-buffer-a',
    size: bufferSize,
    usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
  });
  device.queue.writeBuffer(particleA, 0, initialData);

  const particleB = device.createBuffer({
    label: 'particle-buffer-b',
    size: bufferSize,
    usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
  });
  device.queue.writeBuffer(particleB, 0, initialData);

  const simParamsBuffer = device.createBuffer({
    label: 'sim-params-buffer',
    size: 8 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
  });

  const computeModule = device.createShaderModule({ code: buildComputeShader() });
  const renderModule = device.createShaderModule({ code: buildRenderShader() });

  const computePipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'main',
    },
  });

  const renderPipeline = await device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: {
      module: renderModule,
      entryPoint: 'vertexMain',
    },
    fragment: {
      module: renderModule,
      entryPoint: 'fragmentMain',
      targets: [
        {
          format: presentationFormat,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        },
      ],
    },
    primitive: {
      topology: 'point-list',
    },
  });

  const computeBindGroupA = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleA } },
      { binding: 1, resource: { buffer: particleB } },
      { binding: 2, resource: { buffer: simParamsBuffer } },
    ],
  });

  const computeBindGroupB = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleB } },
      { binding: 1, resource: { buffer: particleA } },
      { binding: 2, resource: { buffer: simParamsBuffer } },
    ],
  });

  const renderBindGroupA = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: particleA } }],
  });

  const renderBindGroupB = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: particleB } }],
  });

  let activeReadIndex = 0;
  let controlState: HostControlState = {
    pointerX: 0,
    pointerY: 0,
    pointerDown: false,
    prompt: '',
  };

  let running = false;
  let frameHandle = 0;
  let width = 1;
  let height = 1;
  let devicePixelRatio = 1;
  let elapsedTime = 0;
  let lastFrame = performance.now();

  const updateCanvasSize = () => {
    canvas.width = Math.max(1, Math.floor(width * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(height * devicePixelRatio));

    context.configure({
      device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });
  };

  const writeParams = (deltaTime: number) => {
    elapsedTime += deltaTime;

    const packed = new Float32Array(8);
    const params: SimulationParams = {
      mouseX: controlState.pointerX,
      mouseY: controlState.pointerY,
      pointerDown: controlState.pointerDown ? 1 : 0,
      promptEnergy: promptToEnergy(controlState.prompt),
      deltaTime,
      time: elapsedTime,
    };

    packed[0] = params.mouseX;
    packed[1] = params.mouseY;
    packed[2] = params.pointerDown;
    packed[3] = params.promptEnergy;
    packed[4] = params.deltaTime;
    packed[5] = params.time;
    packed[6] = 0;
    packed[7] = 0;

    device.queue.writeBuffer(simParamsBuffer, 0, packed.buffer, packed.byteOffset, packed.byteLength);
  };

  const renderFrame = (timestamp: number) => {
    if (!running) {
      return;
    }

    const frameStart = performance.now();

    const rawDt = Math.max(0.001, (timestamp - lastFrame) / 1000);
    const deltaTime = Math.min(rawDt, 0.033);
    lastFrame = timestamp;

    writeParams(deltaTime);

    const commandEncoder = device.createCommandEncoder();

    {
      const computePass = commandEncoder.beginComputePass();
      computePass.setPipeline(computePipeline);
      computePass.setBindGroup(0, activeReadIndex === 0 ? computeBindGroupA : computeBindGroupB);
      computePass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / WORKGROUP_SIZE));
      computePass.end();
    }

    const renderOutputIndex = 1 - activeReadIndex;
    const view = context.getCurrentTexture().createView();

    {
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0.01, g: 0.02, b: 0.05, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });

      renderPass.setPipeline(renderPipeline);
      renderPass.setBindGroup(0, renderOutputIndex === 0 ? renderBindGroupA : renderBindGroupB);
      renderPass.draw(PARTICLE_COUNT);
      renderPass.end();
    }

    device.queue.submit([commandEncoder.finish()]);

    activeReadIndex = renderOutputIndex;

    const frameMs = performance.now() - frameStart;
    hooks.onFrameSample(frameMs);

    frameHandle = requestAnimationFrame(renderFrame);
  };

  return {
    start: () => {
      if (running) {
        return;
      }

      running = true;
      lastFrame = performance.now();
      frameHandle = requestAnimationFrame(renderFrame);
    },
    stop: () => {
      running = false;
      if (frameHandle) {
        cancelAnimationFrame(frameHandle);
      }
      frameHandle = 0;
    },
    resize: (nextWidth: number, nextHeight: number, dpr: number) => {
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      devicePixelRatio = Math.max(1, dpr);
      updateCanvasSize();
    },
    updateControlState: (nextControlState: HostControlState) => {
      controlState = nextControlState;
    },
    dispose: () => {
      running = false;
      if (frameHandle) {
        cancelAnimationFrame(frameHandle);
      }

      try {
        particleA.destroy();
        particleB.destroy();
        simParamsBuffer.destroy();
      } catch (error) {
        hooks.onError?.(error);
      }
    },
  };
}
