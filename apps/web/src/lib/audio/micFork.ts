export type PcmFrameConsumer = (frame: Float32Array, sampleRate: number) => void;

type MicForkOptions = {
  scriptProcessorBufferSize?: number;
};

export type MicFork = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  subscribe: (consumer: PcmFrameConsumer) => () => void;
  isRunning: () => boolean;
};

type WorkletNodeLike = AudioWorkletNode | ScriptProcessorNode;

const DEFAULT_BUFFER_SIZE = 1024;
const WORKLET_PROCESSOR_NAME = 'xrb-mic-fork';

function clampBufferSize(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_BUFFER_SIZE;
  }

  const allowed = [256, 512, 1024, 2048, 4096, 8192, 16384];
  const matched = allowed.find((candidate) => candidate >= value);
  return matched ?? DEFAULT_BUFFER_SIZE;
}

function toFloat32Frame(input: Float32Array): Float32Array {
  const copy = new Float32Array(input.length);
  copy.set(input);
  return copy;
}

function createWorkletSource(): string {
  return `
class XrbMicForkProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const source = inputs[0];
    if (!source || source.length === 0) {
      return true;
    }

    const channel = source[0];
    if (!channel || channel.length === 0) {
      return true;
    }

    this.port.postMessage(channel.slice(0));
    return true;
  }
}

registerProcessor('${WORKLET_PROCESSOR_NAME}', XrbMicForkProcessor);
`;
}

export function createMicFork(stream: MediaStream, options: MicForkOptions = {}): MicFork {
  const consumers = new Set<PcmFrameConsumer>();
  const bufferSize = clampBufferSize(options.scriptProcessorBufferSize);

  let running = false;
  let context: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let monitorGain: GainNode | null = null;
  let processorNode: WorkletNodeLike | null = null;
  let workletUrl: string | null = null;

  const dispatchFrame = (frame: Float32Array) => {
    if (!running || consumers.size === 0 || !context) {
      return;
    }

    const payload = toFloat32Frame(frame);
    for (const consumer of consumers) {
      try {
        consumer(payload, context.sampleRate);
      } catch {
        // Consumer errors are isolated to avoid impacting other downstream listeners.
      }
    }
  };

  const startWithScriptProcessor = (ctx: AudioContext, source: MediaStreamAudioSourceNode, gain: GainNode) => {
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
    processor.onaudioprocess = (event) => {
      const channel = event.inputBuffer.getChannelData(0);
      dispatchFrame(channel);
    };

    source.connect(processor);
    processor.connect(gain);
    return processor;
  };

  const startWithWorklet = async (ctx: AudioContext, source: MediaStreamAudioSourceNode, gain: GainNode) => {
    const workletSource = createWorkletSource();
    const blob = new Blob([workletSource], { type: 'application/javascript' });
    workletUrl = URL.createObjectURL(blob);

    await ctx.audioWorklet.addModule(workletUrl);
    const workletNode = new AudioWorkletNode(ctx, WORKLET_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });

    workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!(event.data instanceof Float32Array)) {
        return;
      }
      dispatchFrame(event.data);
    };

    source.connect(workletNode);
    workletNode.connect(gain);
    return workletNode;
  };

  return {
    start: async () => {
      if (running) {
        return;
      }

      context = new AudioContext({ latencyHint: 'interactive' });
      sourceNode = context.createMediaStreamSource(stream);
      monitorGain = context.createGain();
      monitorGain.gain.value = 0;
      monitorGain.connect(context.destination);

      if (context.state === 'suspended') {
        await context.resume();
      }

      try {
        if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
          processorNode = await startWithWorklet(context, sourceNode, monitorGain);
        } else {
          processorNode = startWithScriptProcessor(context, sourceNode, monitorGain);
        }
      } catch {
        processorNode = startWithScriptProcessor(context, sourceNode, monitorGain);
      }

      running = true;
    },
    stop: async () => {
      if (!context) {
        running = false;
        return;
      }

      running = false;

      try {
        if (processorNode instanceof AudioWorkletNode) {
          processorNode.port.onmessage = null;
        }

        if (processorNode instanceof ScriptProcessorNode) {
          processorNode.onaudioprocess = null;
        }

        processorNode?.disconnect();
      } catch {
        // ignore cleanup race
      }

      try {
        sourceNode?.disconnect();
      } catch {
        // ignore cleanup race
      }

      try {
        monitorGain?.disconnect();
      } catch {
        // ignore cleanup race
      }

      processorNode = null;
      sourceNode = null;
      monitorGain = null;

      if (workletUrl) {
        URL.revokeObjectURL(workletUrl);
        workletUrl = null;
      }

      const ctx = context;
      context = null;
      await ctx.close().catch(() => undefined);
    },
    subscribe: (consumer: PcmFrameConsumer) => {
      consumers.add(consumer);
      return () => {
        consumers.delete(consumer);
      };
    },
    isRunning: () => running,
  };
}
