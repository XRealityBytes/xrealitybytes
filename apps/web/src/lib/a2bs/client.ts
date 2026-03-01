import type { BlendshapeMap } from './smoothing';

export type A2BSConnectionState = 'disconnected' | 'connecting' | 'connected';

export type A2BSBlendshapeFrame = {
  t: number;
  bs: BlendshapeMap;
};

export type A2BSDiagnostics = {
  blendshapeFps: number;
  rttMs: number | null;
  droppedFrames: number;
};

type A2BSClientCallbacks = {
  onStatus?: (status: A2BSConnectionState) => void;
  onFrame?: (frame: A2BSBlendshapeFrame) => void;
  onDiagnostics?: (diagnostics: A2BSDiagnostics) => void;
  onError?: (message: string) => void;
};

type A2BSClientOptions = {
  url?: string;
  targetSampleRate?: number;
  frameSamples?: number;
  maxBufferedAmount?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  callbacks?: A2BSClientCallbacks;
};

type PongPayload = {
  type?: unknown;
  clientTsMs?: unknown;
};

const DEFAULT_A2BS_WS_URL = 'ws://localhost:8765/ws/a2bs';

function resolveWebSocketUrl(input: string): string {
  const candidate = input.trim();
  if (!candidate) {
    return DEFAULT_A2BS_WS_URL;
  }

  if (/^wss?:\/\//i.test(candidate)) {
    return candidate;
  }

  if (candidate.startsWith('/')) {
    if (typeof window === 'undefined') {
      return `ws://localhost:8765${candidate}`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}${candidate}`;
  }

  return DEFAULT_A2BS_WS_URL;
}

function parseBlendshapeFrame(payload: unknown): A2BSBlendshapeFrame | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const raw = payload as Record<string, unknown>;
  if (raw.type !== 'bs' || typeof raw.t !== 'number' || !raw.bs || typeof raw.bs !== 'object') {
    return null;
  }

  const bsInput = raw.bs as Record<string, unknown>;
  const bs: BlendshapeMap = {};
  for (const [key, value] of Object.entries(bsInput)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      bs[key] = Math.min(1, Math.max(0, value));
    }
  }

  return {
    t: raw.t,
    bs,
  };
}

function concatFloat32(
  a: Float32Array<ArrayBufferLike>,
  b: Float32Array<ArrayBufferLike>,
): Float32Array<ArrayBufferLike> {
  if (a.length === 0) {
    return b;
  }

  if (b.length === 0) {
    return a;
  }

  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export class A2BSClient {
  private readonly url: string;
  private readonly targetSampleRate: number;
  private readonly frameSamples: number;
  private readonly maxBufferedAmount: number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;

  private ws: WebSocket | null = null;
  private state: A2BSConnectionState = 'disconnected';
  private shouldReconnect = false;
  private reconnectAttempt = 0;
  private reconnectHandle: number | null = null;
  private pingHandle: number | null = null;

  private callbacks: A2BSClientCallbacks;

  private resampleSourceRate = 0;
  private resampleCarry: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private resamplePosition = 0;
  private pendingTarget: Float32Array<ArrayBufferLike> = new Float32Array(0);

  private lastFrameAtMs = 0;
  private blendshapeFps = 0;
  private lastRttMs: number | null = null;
  private droppedFrames = 0;

  constructor(options: A2BSClientOptions = {}) {
    const configuredUrl = options.url ?? process.env.NEXT_PUBLIC_A2BS_WS_URL ?? DEFAULT_A2BS_WS_URL;
    this.url = resolveWebSocketUrl(configuredUrl);
    this.targetSampleRate = options.targetSampleRate ?? 16_000;
    this.frameSamples = options.frameSamples ?? 320;
    this.maxBufferedAmount = options.maxBufferedAmount ?? 128 * 1024;
    this.reconnectBaseMs = options.reconnectBaseMs ?? 400;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 6_000;
    this.callbacks = options.callbacks ?? {};
  }

  setCallbacks(callbacks: A2BSClientCallbacks): void {
    this.callbacks = callbacks;
  }

  getStatus(): A2BSConnectionState {
    return this.state;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnect();
    this.stopPing();
    this.setState('disconnected');

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore close race
      }
      this.ws = null;
    }
  }

  pushPcmFrame(frame: Float32Array<ArrayBufferLike>, sampleRate: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const resampled = this.resampleToTarget(frame, sampleRate);
    if (resampled.length === 0) {
      return;
    }

    this.pendingTarget = concatFloat32(this.pendingTarget, resampled);

    while (this.pendingTarget.length >= this.frameSamples) {
      const chunk = this.pendingTarget.slice(0, this.frameSamples);
      this.pendingTarget = this.pendingTarget.slice(this.frameSamples);

      if (this.ws.bufferedAmount > this.maxBufferedAmount) {
        this.droppedFrames += 1;
        this.emitDiagnostics();
        continue;
      }

      const payload = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
      this.ws.send(payload);
    }
  }

  private openSocket(): void {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.clearReconnect();
    this.setState('connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch (error) {
      this.setState('disconnected');
      this.callbacks.onError?.(error instanceof Error ? error.message : 'Unable to create A2BS WebSocket.');
      this.scheduleReconnect();
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.resampleSourceRate = 0;
      this.resampleCarry = new Float32Array(0);
      this.pendingTarget = new Float32Array(0);
      this.resamplePosition = 0;
      this.setState('connected');
      this.startPing();

      socket.send(
        JSON.stringify({
          type: 'hello',
          sampleRate: this.targetSampleRate,
          format: 'f32',
          frameSamples: this.frameSamples,
        }),
      );
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data) as unknown;
      } catch {
        return;
      }

      const frame = parseBlendshapeFrame(parsed);
      if (frame) {
        this.updateFps();
        this.callbacks.onFrame?.(frame);
        this.emitDiagnostics();
        return;
      }

      const pong = parsed as PongPayload;
      if (pong.type === 'pong' && typeof pong.clientTsMs === 'number') {
        this.lastRttMs = Math.max(0, performance.now() - pong.clientTsMs);
        this.emitDiagnostics();
      }
    };

    socket.onerror = () => {
      this.callbacks.onError?.('A2BS socket error. Falling back to chat-only mode.');
    };

    socket.onclose = () => {
      this.stopPing();
      this.setState('disconnected');
      this.ws = null;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  private setState(next: A2BSConnectionState): void {
    if (this.state === next) {
      return;
    }
    this.state = next;
    this.callbacks.onStatus?.(next);
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectHandle !== null) {
      return;
    }

    const exponent = Math.min(this.reconnectAttempt, 8);
    const delay = Math.min(this.reconnectBaseMs * 2 ** exponent, this.reconnectMaxMs);
    this.reconnectAttempt += 1;

    this.reconnectHandle = window.setTimeout(() => {
      this.reconnectHandle = null;
      this.openSocket();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectHandle !== null) {
      window.clearTimeout(this.reconnectHandle);
      this.reconnectHandle = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingHandle = window.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      this.ws.send(
        JSON.stringify({
          type: 'ping',
          clientTsMs: performance.now(),
        }),
      );
    }, 1500);
  }

  private stopPing(): void {
    if (this.pingHandle !== null) {
      window.clearInterval(this.pingHandle);
      this.pingHandle = null;
    }
  }

  private emitDiagnostics(): void {
    this.callbacks.onDiagnostics?.({
      blendshapeFps: this.blendshapeFps,
      rttMs: this.lastRttMs,
      droppedFrames: this.droppedFrames,
    });
  }

  private updateFps(): void {
    const nowMs = performance.now();
    if (this.lastFrameAtMs <= 0) {
      this.lastFrameAtMs = nowMs;
      this.blendshapeFps = 0;
      return;
    }

    const dt = nowMs - this.lastFrameAtMs;
    this.lastFrameAtMs = nowMs;
    if (dt <= 0) {
      return;
    }

    const instant = 1000 / dt;
    this.blendshapeFps = this.blendshapeFps <= 0 ? instant : this.blendshapeFps * 0.8 + instant * 0.2;
  }

  private resampleToTarget(
    input: Float32Array<ArrayBufferLike>,
    sourceRate: number,
  ): Float32Array<ArrayBufferLike> {
    if (!Number.isFinite(sourceRate) || sourceRate <= 0 || input.length === 0) {
      return new Float32Array(0);
    }

    if (sourceRate === this.targetSampleRate) {
      return input;
    }

    if (this.resampleSourceRate !== sourceRate) {
      this.resampleSourceRate = sourceRate;
      this.resampleCarry = new Float32Array(0);
      this.resamplePosition = 0;
    }

    const merged = concatFloat32(this.resampleCarry, input);
    if (merged.length < 2) {
      this.resampleCarry = merged;
      return new Float32Array(0);
    }

    const step = sourceRate / this.targetSampleRate;
    let position = this.resamplePosition;
    const out: number[] = [];

    while (position + 1 < merged.length) {
      const baseIndex = Math.floor(position);
      const fraction = position - baseIndex;
      const left = merged[baseIndex] ?? 0;
      const right = merged[baseIndex + 1] ?? left;
      out.push(left + (right - left) * fraction);
      position += step;
    }

    const carryStart = Math.max(0, Math.floor(position) - 1);
    this.resampleCarry = merged.slice(carryStart);
    this.resamplePosition = position - carryStart;

    return Float32Array.from(out);
  }
}
