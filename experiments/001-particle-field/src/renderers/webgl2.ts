import type { HostControlState, RendererControl, RendererHooks } from '@xrb/lab-core';

const PARTICLE_COUNT = 4_096;

function promptToEnergy(prompt: string): number {
  if (!prompt.trim()) {
    return 0.2;
  }

  return 0.25 + Math.min(prompt.length / 70, 1) * 0.75;
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create WebGL shader.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error.';
    gl.deleteShader(shader);
    throw new Error(error);
  }

  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShaderSource: string,
  fragmentShaderSource: string,
): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create WebGL program.');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program) ?? 'Unknown program link error.';
    gl.deleteProgram(program);
    throw new Error(error);
  }

  return program;
}

export async function createWebGL2ParticleRenderer(
  canvas: HTMLCanvasElement,
  hooks: RendererHooks,
): Promise<RendererControl> {
  const gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });

  if (!gl) {
    throw new Error('WebGL2 unavailable.');
  }

  const program = createProgram(
    gl,
    `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
layout(location = 1) in float aSpeed;
uniform float uPointSize;
out float vSpeed;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  gl_PointSize = uPointSize;
  vSpeed = aSpeed;
}
`,
    `#version 300 es
precision highp float;
in float vSpeed;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float radial = max(0.0, 1.0 - dot(p, p));
  vec3 low = vec3(0.08, 0.33, 0.58);
  vec3 high = vec3(0.25, 0.94, 1.0);
  vec3 color = mix(low, high, clamp(vSpeed * 14.0, 0.0, 1.0));
  outColor = vec4(color, radial * 0.78);
}
`,
  );

  const positions = new Float32Array(PARTICLE_COUNT * 2);
  const velocities = new Float32Array(PARTICLE_COUNT * 2);
  const speeds = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const i2 = i * 2;
    const theta = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * 0.9;

    positions[i2] = Math.cos(theta) * radius;
    positions[i2 + 1] = Math.sin(theta) * radius;
    velocities[i2] = (Math.random() - 0.5) * 0.01;
    velocities[i2 + 1] = (Math.random() - 0.5) * 0.01;
    speeds[i] = 0;
  }

  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error('Failed to create VAO.');
  }

  const positionBuffer = gl.createBuffer();
  const speedBuffer = gl.createBuffer();
  if (!positionBuffer || !speedBuffer) {
    throw new Error('Failed to create WebGL buffers.');
  }

  gl.bindVertexArray(vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, speedBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, speeds.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  const pointSizeLocation = gl.getUniformLocation(program, 'uPointSize');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  let running = false;
  let frameHandle = 0;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let controlState: HostControlState = {
    pointerX: 0,
    pointerY: 0,
    pointerDown: false,
    prompt: '',
  };
  let lastFrame = performance.now();

  const resize = () => {
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const updateSimulation = (deltaTime: number) => {
    const influence = controlState.pointerDown ? 1 : 0;
    const promptEnergy = promptToEnergy(controlState.prompt);

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const i2 = i * 2;
      const px = positions[i2] ?? 0;
      const py = positions[i2 + 1] ?? 0;

      const dx = controlState.pointerX - px;
      const dy = controlState.pointerY - py;
      const distSq = dx * dx + dy * dy + 0.06;

      const accelScale = influence * promptEnergy * 0.0017 / distSq;
      let nextVx = (velocities[i2] ?? 0) + dx * accelScale;
      let nextVy = (velocities[i2 + 1] ?? 0) + dy * accelScale;

      const swirlX = -py * (0.0007 + promptEnergy * 0.0006);
      const swirlY = px * (0.0007 + promptEnergy * 0.0006);
      nextVx += swirlX;
      nextVy += swirlY;

      nextVx *= 0.985;
      nextVy *= 0.985;

      let nextPx = px + nextVx * deltaTime * 60;
      let nextPy = py + nextVy * deltaTime * 60;

      if (nextPx > 1 || nextPx < -1) {
        nextVx = -nextVx;
        nextPx = Math.max(-1, Math.min(1, nextPx));
      }

      if (nextPy > 1 || nextPy < -1) {
        nextVy = -nextVy;
        nextPy = Math.max(-1, Math.min(1, nextPy));
      }

      positions[i2] = nextPx;
      positions[i2 + 1] = nextPy;
      velocities[i2] = nextVx;
      velocities[i2 + 1] = nextVy;
      speeds[i] = Math.min(1, Math.hypot(nextVx, nextVy) * 14);
    }
  };

  const render = (timestamp: number) => {
    if (!running) {
      return;
    }

    const frameStart = performance.now();

    const rawDt = Math.max(0.001, (timestamp - lastFrame) / 1000);
    const deltaTime = Math.min(rawDt, 0.033);
    lastFrame = timestamp;

    updateSimulation(deltaTime);

    gl.useProgram(program);
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);

    gl.bindBuffer(gl.ARRAY_BUFFER, speedBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, speeds);

    const pointSize = 1.8 + promptToEnergy(controlState.prompt) * 0.6;
    if (pointSizeLocation) {
      gl.uniform1f(pointSizeLocation, pointSize);
    }

    gl.clearColor(0.01, 0.02, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);

    const frameMs = performance.now() - frameStart;
    hooks.onFrameSample(frameMs);

    frameHandle = requestAnimationFrame(render);
  };

  return {
    start: () => {
      if (running) {
        return;
      }

      running = true;
      lastFrame = performance.now();
      frameHandle = requestAnimationFrame(render);
    },
    stop: () => {
      running = false;
      if (frameHandle) {
        cancelAnimationFrame(frameHandle);
      }
      frameHandle = 0;
    },
    resize: (nextWidth: number, nextHeight: number, nextDpr: number) => {
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      dpr = Math.max(1, nextDpr);
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

      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(speedBuffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
