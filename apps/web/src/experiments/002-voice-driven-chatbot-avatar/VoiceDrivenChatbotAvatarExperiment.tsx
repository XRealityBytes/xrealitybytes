'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import Image from 'next/image';
import { AudioLines, Mic, Radio, RefreshCw, Square, Volume2, VolumeX } from 'lucide-react';

import { Card } from '@/components/Card';
import { GpuCanvasHost } from '@/components/lab/GpuCanvasHost';
import type { AvatarExpressionTargets } from '@/lib/a2bs/apply';
import { applyBlendshapesToRig } from '@/lib/a2bs/apply';
import { ARKIT_52_BLENDSHAPES } from '@/lib/a2bs/arkit52';
import type { A2BSConnectionState } from '@/lib/a2bs/client';
import { A2BSClient } from '@/lib/a2bs/client';
import { BlendshapeEmaSmoother, type BlendshapeMap } from '@/lib/a2bs/smoothing';
import type { MicFork } from '@/lib/audio/micFork';
import { createMicFork } from '@/lib/audio/micFork';

import { createWebGL2AvatarRenderer } from '@experiments/002-voice-driven-chatbot-avatar/src/renderers/webgl2';
import { createWebGPUAvatarRenderer } from '@experiments/002-voice-driven-chatbot-avatar/src/renderers/webgpu';

type AssistantStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';
type InteractionMode = 'hold' | 'hands-free';

type TranscriptMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  streaming?: boolean;
};

type RealtimeSessionResponse = {
  ok: boolean;
  session?: {
    model?: string;
    client_secret?: {
      value?: string;
    };
  };
  error?: {
    message?: string;
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type RealtimeRefs = {
  peerConnection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  localStream: MediaStream | null;
  remoteAudio: HTMLAudioElement | null;
};

type SpeechRecognitionErrorLike = {
  error?: unknown;
  message?: unknown;
};

const AI_MODE = process.env.NEXT_PUBLIC_XRB_AI_MODE === 'openai' ? 'openai' : 'local';
const VOICE_DEBUG_PREFIX = '[XRB Voice]';
const DEFAULT_ROLE_PROMPT =
  'You are the XRealityBytes Lab assistant. Keep answers concise, technically grounded, and helpful for experimental prototyping.';
const ROLE_PROMPT_STORAGE_KEY = 'xrb.voice.rolePrompt.v1';
const CHAT_HISTORY_STORAGE_KEY = 'xrb.voice.chatHistory.v1';
const HISTORY_LIMIT = 18;
const MEMORY_CHAR_LIMIT = 2200;
const SENTENCE_CHUNK_MAX = 180;
const A2BS_BAR_KEYS = [
  'jawOpen',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthFunnel',
  'mouthPucker',
  'mouthClose',
  'cheekPuff',
  'eyeBlinkLeft',
  'eyeBlinkRight',
] as const;

type ChatHistoryRole = 'user' | 'assistant';

type ChatHistoryItem = {
  role: ChatHistoryRole;
  text: string;
};

type StreamAssistantOptions = {
  onSpeakableChunk?: (chunk: string) => void;
};

function isVoiceDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return process.env.NODE_ENV !== 'production';
  }

  const forced = window.localStorage.getItem('xrbVoiceDebug');
  if (forced === '1' || forced === 'true') {
    return true;
  }

  if (forced === '0' || forced === 'false') {
    return false;
  }

  return process.env.NODE_ENV !== 'production';
}

function debugVoice(step: string, details?: unknown): void {
  if (!isVoiceDebugEnabled()) {
    return;
  }

  const stamp = new Date().toISOString();
  if (details === undefined) {
    console.debug(`${VOICE_DEBUG_PREFIX} ${stamp} ${step}`);
    return;
  }

  console.debug(`${VOICE_DEBUG_PREFIX} ${stamp} ${step}`, details);
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function parseJsonSafe(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

function extractRealtimeDeltaText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const event = payload as Record<string, unknown>;

  if (typeof event.delta === 'string') {
    return event.delta;
  }

  if (typeof event.text === 'string') {
    return event.text;
  }

  const part = (event.part as Record<string, unknown> | undefined)?.text;
  if (typeof part === 'string') {
    return part;
  }

  return '';
}

function extractRealtimeUserTranscript(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const event = payload as Record<string, unknown>;
  if (typeof event.transcript === 'string') {
    return event.transcript;
  }

  const item = event.item as Record<string, unknown> | undefined;
  const content = Array.isArray(item?.content) ? item.content : [];
  const first = content[0] as Record<string, unknown> | undefined;

  if (typeof first?.transcript === 'string') {
    return first.transcript;
  }

  return '';
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function getSseDelta(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const event = payload as Record<string, unknown>;

  if (typeof event.delta === 'string') {
    return event.delta;
  }

  if (typeof event.output_text === 'string') {
    return event.output_text;
  }

  if (typeof event.response === 'string') {
    return event.response;
  }

  const item = event.item as Record<string, unknown> | undefined;
  if (typeof item?.text === 'string') {
    return item.text;
  }

  return '';
}

function getSseError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const event = payload as Record<string, unknown>;
  return typeof event.error === 'string' ? event.error : '';
}

function sanitizeRolePrompt(input: string): string {
  const normalized = normalizeText(input);
  if (!normalized) {
    return DEFAULT_ROLE_PROMPT;
  }

  return normalized.slice(0, 2000);
}

function splitSpeakableChunks(buffer: string, flush = false): { chunks: string[]; remainder: string } {
  let remainder = buffer;
  const chunks: string[] = [];

  const emitHead = (endIndex: number) => {
    const candidate = normalizeText(remainder.slice(0, endIndex));
    if (candidate) {
      chunks.push(candidate);
    }
    remainder = remainder.slice(endIndex);
  };

  while (remainder.length > 0) {
    const match = /([.!?]+["')\]]*\s+|\n+)/.exec(remainder);
    if (!match || typeof match.index !== 'number') {
      break;
    }

    const end = match.index + match[0].length;
    emitHead(end);
  }

  while (remainder.length > SENTENCE_CHUNK_MAX) {
    const cutAt = remainder.lastIndexOf(' ', SENTENCE_CHUNK_MAX);
    if (cutAt <= 32) {
      break;
    }

    emitHead(cutAt + 1);
  }

  if (flush && remainder.trim()) {
    emitHead(remainder.length);
  }

  return {
    chunks,
    remainder,
  };
}

function buildConversationMemory(history: ChatHistoryItem[]): string {
  if (history.length <= HISTORY_LIMIT) {
    return '';
  }

  const older = history.slice(0, Math.max(0, history.length - HISTORY_LIMIT));
  const lines = older
    .map((item) => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.text}`)
    .filter(Boolean);

  const merged = lines.join('\n');
  if (merged.length <= MEMORY_CHAR_LIMIT) {
    return merged;
  }

  return merged.slice(merged.length - MEMORY_CHAR_LIMIT);
}

function parseStoredMessages(raw: string): TranscriptMessage[] {
  const parsed = parseJsonSafe(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }

  const normalized: TranscriptMessage[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const candidate = item as Record<string, unknown>;
    const role = candidate.role;
    const text = normalizeText(candidate.text);

    if ((role === 'user' || role === 'assistant' || role === 'system') && text) {
      normalized.push({
        id: createId(String(role)),
        role,
        text: text.slice(0, 3000),
        streaming: false,
      });
    }
  }

  return normalized.slice(-80);
}

function toSpeechRecognitionErrorMessage(rawEvent: unknown): string {
  const event = (rawEvent ?? {}) as SpeechRecognitionErrorLike;
  const code = normalizeText(event.error);
  const fallbackMessage = normalizeText(event.message);

  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone permission was denied. Allow microphone access in browser/site settings and try again.';
  }

  if (code === 'audio-capture') {
    return 'No microphone input device was found. Connect/enable a microphone and retry.';
  }

  if (code === 'no-speech') {
    return 'No speech was detected. Hold the button and speak clearly, then release.';
  }

  if (code) {
    return `Speech recognition error: ${code}.`;
  }

  if (fallbackMessage) {
    return `Speech recognition error: ${fallbackMessage}.`;
  }

  return 'Speech recognition failed before transcription completed.';
}

export default function VoiceDrivenChatbotAvatarExperiment() {
  const localMode = AI_MODE === 'local';

  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [rolePrompt, setRolePrompt] = useState<string>(DEFAULT_ROLE_PROMPT);
  const [status, setStatus] = useState<AssistantStatus>('idle');
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('hold');
  const [handsFreeActive, setHandsFreeActive] = useState(false);
  const [fallbackActive, setFallbackActive] = useState(false);
  const [fallbackReason, setFallbackReason] = useState('');
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [hasMicStream, setHasMicStream] = useState(false);
  const [avatarBlendshapesEnabled, setAvatarBlendshapesEnabled] = useState(false);
  const [a2bsStatus, setA2bsStatus] = useState<A2BSConnectionState>('disconnected');
  const [a2bsFps, setA2bsFps] = useState(0);
  const [a2bsRttMs, setA2bsRttMs] = useState<number | null>(null);
  const [a2bsDroppedFrames, setA2bsDroppedFrames] = useState(0);
  const [a2bsError, setA2bsError] = useState('');
  const [a2bsBars, setA2bsBars] = useState<BlendshapeMap>(() => {
    const initial: BlendshapeMap = {};
    for (const key of A2BS_BAR_KEYS) {
      initial[key] = 0;
    }
    return initial;
  });

  const audioLevelRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number>(0);
  const activeAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const sourceMapRef = useRef(new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>());

  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackAudioObjectUrlRef = useRef<string>('');

  const realtimeRef = useRef<RealtimeRefs>({
    peerConnection: null,
    dataChannel: null,
    localStream: null,
    remoteAudio: null,
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamContainerRef = useRef<MediaStream | null>(null);
  const localTtsPulseRef = useRef<number>(0);
  const micForkRef = useRef<MicFork | null>(null);
  const micForkUnsubscribeRef = useRef<(() => void) | null>(null);
  const a2bsClientRef = useRef<A2BSClient | null>(null);
  const a2bsSmootherRef = useRef(
    new BlendshapeEmaSmoother({
      alpha: 0.28,
      keys: ARKIT_52_BLENDSHAPES,
    }),
  );
  const a2bsExternalExpressionRef = useRef<AvatarExpressionTargets | null>(null);
  const a2bsUiUpdateAtRef = useRef(0);
  const avatarBlendshapesEnabledRef = useRef(false);

  const assistantStreamingIdRef = useRef<string>('');
  const activeTurnIdRef = useRef<number>(0);
  const hasLoadedPersistenceRef = useRef(false);
  const turnInFlightRef = useRef(false);
  const handsFreeDesiredRef = useRef(false);
  const lastSystemErrorRef = useRef<{
    text: string;
    atMs: number;
  }>({
    text: '',
    atMs: 0,
  });
  const lastFallbackTurnRef = useRef<{
    text: string;
    atMs: number;
  }>({
    text: '',
    atMs: 0,
  });

  const realtimeConnected = realtimeReady && !fallbackActive;

  useEffect(() => {
    debugVoice('init', {
      aiMode: AI_MODE,
      debugToggleHint: 'Use localStorage.setItem("xrbVoiceDebug","1") to force-enable debug logs.',
    });

    const storedRolePrompt = window.localStorage.getItem(ROLE_PROMPT_STORAGE_KEY);
    if (storedRolePrompt) {
      setRolePrompt(sanitizeRolePrompt(storedRolePrompt));
    }

    const storedMessages = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    if (storedMessages) {
      setMessages(parseStoredMessages(storedMessages));
    }

    hasLoadedPersistenceRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!hasLoadedPersistenceRef.current) {
      return;
    }

    window.localStorage.setItem(ROLE_PROMPT_STORAGE_KEY, sanitizeRolePrompt(rolePrompt));
  }, [rolePrompt]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!hasLoadedPersistenceRef.current) {
      return;
    }

    const persisted = messages
      .filter((message) => !message.streaming)
      .slice(-80)
      .map((message) => ({
        role: message.role,
        text: message.text,
      }));

    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(persisted));
  }, [messages]);

  useEffect(() => {
    avatarBlendshapesEnabledRef.current = avatarBlendshapesEnabled;
    if (!avatarBlendshapesEnabled) {
      a2bsExternalExpressionRef.current = null;
    }
  }, [avatarBlendshapesEnabled]);

  useEffect(() => {
    debugVoice('state', {
      status,
      interactionMode,
      fallbackActive,
      fallbackReason,
      realtimeReady,
      realtimeConnected,
      isRecording,
      handsFreeActive,
      isMuted,
      avatarBlendshapesEnabled,
      a2bsStatus,
    });
  }, [
    a2bsStatus,
    avatarBlendshapesEnabled,
    fallbackActive,
    fallbackReason,
    handsFreeActive,
    interactionMode,
    isMuted,
    isRecording,
    realtimeConnected,
    realtimeReady,
    status,
  ]);

  const appendMessage = useCallback((role: TranscriptMessage['role'], text: string, streaming = false): string => {
    const safeText = text.trim();
    if (!safeText) {
      return '';
    }

    const id = createId(role);
    setMessages((current) => [...current, { id, role, text: safeText, streaming }]);
    return id;
  }, []);

  const appendAssistantDelta = useCallback((delta: string) => {
    const chunk = delta;
    if (!chunk) {
      return;
    }

    setMessages((current) => {
      const streamingId = assistantStreamingIdRef.current;
      if (streamingId) {
        return current.map((message) =>
          message.id === streamingId ? { ...message, text: message.text + chunk, streaming: true } : message,
        );
      }

      const id = createId('assistant');
      assistantStreamingIdRef.current = id;
      return [...current, { id, role: 'assistant', text: chunk, streaming: true }];
    });
  }, []);

  const appendSystemMessage = useCallback(
    (text: string, dedupeWindowMs = 3000) => {
      const safe = normalizeText(text);
      if (!safe) {
        return;
      }

      const nowMs = Date.now();
      const previous = lastSystemErrorRef.current;
      if (previous.text === safe && nowMs - previous.atMs < dedupeWindowMs) {
        return;
      }

      lastSystemErrorRef.current = {
        text: safe,
        atMs: nowMs,
      };
      debugVoice('system-message', { text: safe });
      appendMessage('system', safe);
    },
    [appendMessage],
  );

  const finalizeAssistantStream = useCallback((): string => {
    let finalText = '';

    setMessages((current) =>
      current.map((message) => {
        if (message.id === assistantStreamingIdRef.current) {
          finalText = message.text;
          return { ...message, streaming: false };
        }

        return message;
      }),
    );

    assistantStreamingIdRef.current = '';
    return finalText;
  }, []);

  const stopMeter = useCallback(() => {
    if (meterFrameRef.current) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = 0;
    }
    audioLevelRef.current = audioLevelRef.current * 0.82;
  }, []);

  const startMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }

    if (meterFrameRef.current) {
      cancelAnimationFrame(meterFrameRef.current);
    }

    const waveform = new Uint8Array(analyser.fftSize);

    const loop = () => {
      analyser.getByteTimeDomainData(waveform);

      let total = 0;
      for (const value of waveform) {
        const normalized = (value - 128) / 128;
        total += normalized * normalized;
      }

      const rms = Math.sqrt(total / waveform.length);
      const next = Math.min(1, rms * 3.2);
      audioLevelRef.current = audioLevelRef.current * 0.68 + next * 0.32;

      meterFrameRef.current = requestAnimationFrame(loop);
    };

    meterFrameRef.current = requestAnimationFrame(loop);
  }, []);

  const stopLocalTtsPulse = useCallback(() => {
    if (localTtsPulseRef.current) {
      window.clearInterval(localTtsPulseRef.current);
      localTtsPulseRef.current = 0;
    }
    audioLevelRef.current = audioLevelRef.current * 0.65;
  }, []);

  const startLocalTtsPulse = useCallback(() => {
    if (localTtsPulseRef.current) {
      window.clearInterval(localTtsPulseRef.current);
    }

    localTtsPulseRef.current = window.setInterval(() => {
      const target = 0.18 + Math.random() * 0.5;
      audioLevelRef.current = audioLevelRef.current * 0.55 + target * 0.45;
    }, 42);
  }, []);

  const monitorAudioElement = useCallback(
    async (element: HTMLAudioElement) => {
      activeAudioElementRef.current = element;

      const context =
        audioContextRef.current ??
        new AudioContext({
          latencyHint: 'interactive',
        });
      audioContextRef.current = context;

      if (context.state === 'suspended') {
        await context.resume();
      }

      let source = sourceMapRef.current.get(element);
      if (!source) {
        source = context.createMediaElementSource(element);
        sourceMapRef.current.set(element, source);
      }

      const analyser =
        analyserRef.current ??
        (() => {
          const created = context.createAnalyser();
          created.fftSize = 256;
          analyserRef.current = created;
          return created;
        })();

      try {
        source.disconnect();
      } catch {
        // ignore disconnect race
      }

      source.connect(analyser);
      analyser.connect(context.destination);
      startMeter();
    },
    [startMeter],
  );

  const stopRealtimeConnection = useCallback(() => {
    const current = realtimeRef.current;
    setRealtimeReady(false);

    current.dataChannel?.close();
    current.peerConnection?.close();

    if (current.localStream) {
      current.localStream.getTracks().forEach((track) => track.stop());
    }

    if (current.remoteAudio) {
      current.remoteAudio.pause();
      current.remoteAudio.srcObject = null;
    }

    realtimeRef.current = {
      peerConnection: null,
      dataChannel: null,
      localStream: null,
      remoteAudio: null,
    };
  }, []);

  const stopHandsFreeRecognition = useCallback(() => {
    handsFreeDesiredRef.current = false;

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  const stopLocalSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      stopLocalTtsPulse();
      return;
    }

    window.speechSynthesis.cancel();
    stopLocalTtsPulse();
  }, [stopLocalTtsPulse]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const stopPlayback = useCallback(() => {
    const audio = fallbackAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    stopLocalSpeech();
    stopMeter();
    setStatus('idle');
  }, [stopLocalSpeech, stopMeter]);

  const stopAllActivity = useCallback(() => {
    activeTurnIdRef.current += 1;
    stopRecording();
    stopHandsFreeRecognition();
    stopPlayback();

    const realtimeStream = realtimeRef.current.localStream;
    realtimeStream?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });

    const dataChannel = realtimeRef.current.dataChannel;
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'response.cancel' }));
    }

    setIsRecording(false);
    setHandsFreeActive(false);
    setStatus('idle');
  }, [stopHandsFreeRecognition, stopPlayback, stopRecording]);

  const ensureMicrophoneStream = useCallback(async (): Promise<MediaStream> => {
    if (streamContainerRef.current) {
      setHasMicStream(true);
      return streamContainerRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    streamContainerRef.current = stream;
    setHasMicStream(true);
    return stream;
  }, []);

  const stopA2bsStream = useCallback(async () => {
    micForkUnsubscribeRef.current?.();
    micForkUnsubscribeRef.current = null;

    a2bsClientRef.current?.disconnect();
    a2bsClientRef.current = null;

    if (micForkRef.current) {
      await micForkRef.current.stop();
      micForkRef.current = null;
    }

    a2bsSmootherRef.current.reset();
    a2bsExternalExpressionRef.current = null;
    setA2bsStatus('disconnected');
    setA2bsFps(0);
    setA2bsRttMs(null);
    setA2bsDroppedFrames(0);
  }, []);

  const startA2bsStream = useCallback(async () => {
    setA2bsError('');
    const micStream = streamContainerRef.current ?? (await ensureMicrophoneStream());

    if (!micForkRef.current) {
      micForkRef.current = createMicFork(micStream);
    }

    if (!micForkRef.current.isRunning()) {
      await micForkRef.current.start();
    }

    if (!a2bsClientRef.current) {
      a2bsClientRef.current = new A2BSClient();
    }

    a2bsClientRef.current.setCallbacks({
      onStatus: (nextStatus) => {
        setA2bsStatus(nextStatus);
      },
      onError: (message) => {
        setA2bsError(message);
      },
      onDiagnostics: (diagnostics) => {
        setA2bsFps(diagnostics.blendshapeFps);
        setA2bsRttMs(diagnostics.rttMs);
        setA2bsDroppedFrames(diagnostics.droppedFrames);
      },
      onFrame: (frame) => {
        const smoothed = a2bsSmootherRef.current.update(frame.bs);
        const expression = applyBlendshapesToRig(null, smoothed);
        a2bsExternalExpressionRef.current = expression;
        audioLevelRef.current = audioLevelRef.current * 0.68 + expression.jawOpen * 0.32;

        const now = performance.now();
        if (now - a2bsUiUpdateAtRef.current < 70) {
          return;
        }

        a2bsUiUpdateAtRef.current = now;
        setA2bsBars((current) => {
          const next: BlendshapeMap = { ...current };
          for (const key of A2BS_BAR_KEYS) {
            next[key] = smoothed[key] ?? 0;
          }
          return next;
        });
      },
    });

    if (!micForkUnsubscribeRef.current) {
      micForkUnsubscribeRef.current = micForkRef.current.subscribe((frame, sampleRate) => {
        a2bsClientRef.current?.pushPcmFrame(frame, sampleRate);
      });
    }

    a2bsClientRef.current.connect();
  }, [ensureMicrophoneStream]);

  useEffect(() => {
    if (!avatarBlendshapesEnabled) {
      void stopA2bsStream();
      return;
    }

    if (!hasMicStream) {
      return;
    }

    void startA2bsStream().catch((error) => {
      setA2bsStatus('disconnected');
      setA2bsError(error instanceof Error ? error.message : 'Failed to start A2BS stream.');
    });
  }, [avatarBlendshapesEnabled, hasMicStream, startA2bsStream, stopA2bsStream]);

  const applyMute = useCallback(
    (nextMuted: boolean) => {
      const remoteAudio = realtimeRef.current.remoteAudio;
      if (remoteAudio) {
        remoteAudio.muted = nextMuted;
      }

      const fallbackAudio = fallbackAudioRef.current;
      if (fallbackAudio) {
        fallbackAudio.muted = nextMuted;
      }

      if (localMode && nextMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        stopLocalTtsPulse();
      }
    },
    [localMode, stopLocalTtsPulse],
  );

  useEffect(() => {
    applyMute(isMuted);
  }, [applyMute, isMuted]);

  const streamAssistantResponse = useCallback(
    async (input: string, options?: StreamAssistantOptions): Promise<string> => {
      const role = sanitizeRolePrompt(rolePrompt);
      const history: ChatHistoryItem[] = messages
        .filter(
          (message): message is TranscriptMessage & { role: ChatHistoryRole } =>
            !message.streaming && (message.role === 'user' || message.role === 'assistant'),
        )
        .map((message) => ({ role: message.role, text: message.text }))
        .slice(-48);

      const memory = buildConversationMemory(history);
      const recentHistory = history.slice(-HISTORY_LIMIT);

      debugVoice('chat:request', {
        inputLength: input.length,
        historyItems: recentHistory.length,
        memoryChars: memory.length,
        roleChars: role.length,
      });

      const response = await fetch('/api/chat/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input,
          history: recentHistory,
          memory,
          systemPrompt: role,
        }),
      });

      debugVoice('chat:response', {
        ok: response.ok,
        status: response.status,
        hasBody: Boolean(response.body),
      });

      if (!response.ok) {
        const maybeError = (await response.json().catch(() => null)) as
          | {
              error?: { message?: string };
            }
          | null;

        throw new Error(maybeError?.error?.message || `Chat route failed with status ${response.status}.`);
      }

      if (!response.body) {
        throw new Error('Chat route did not return a readable stream.');
      }

      setStatus('thinking');
      appendAssistantDelta('');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let chunkCount = 0;
      let streamedChars = 0;
      let speechTail = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith('data:')) {
            continue;
          }

          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            continue;
          }

          const event = parseJsonSafe(payload);
          const streamError = getSseError(event);
          if (streamError) {
            throw new Error(streamError);
          }

          const delta = getSseDelta(event);
          if (!delta) {
            continue;
          }

          setStatus('speaking');
          appendAssistantDelta(delta);
          chunkCount += 1;
          streamedChars += delta.length;

          if (options?.onSpeakableChunk) {
            speechTail += delta;
            const next = splitSpeakableChunks(speechTail, false);
            for (const chunk of next.chunks) {
              options.onSpeakableChunk(chunk);
            }
            speechTail = next.remainder;
          }
        }
      }

      if (options?.onSpeakableChunk) {
        const finalChunk = splitSpeakableChunks(speechTail, true);
        for (const chunk of finalChunk.chunks) {
          options.onSpeakableChunk(chunk);
        }
      }

      const finalText = finalizeAssistantStream();

      debugVoice('chat:stream-complete', {
        chunkCount,
        streamedChars,
        finalChars: finalText.length,
      });

      if (!finalText.trim()) {
        throw new Error('LLM returned an empty response. Check OLLAMA_MODEL and local backend logs.');
      }

      return finalText;
    },
    [appendAssistantDelta, finalizeAssistantStream, messages, rolePrompt],
  );

  const synthesizeSpeech = useCallback(
    async (text: string) => {
      const safeText = text.trim();
      debugVoice('tts:start', {
        localMode,
        muted: isMuted,
        textLength: safeText.length,
      });

      if (!safeText || isMuted) {
        setStatus('idle');
        debugVoice('tts:skip', {
          reason: !safeText ? 'empty-text' : 'muted',
        });
        return;
      }

      if (localMode) {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          setStatus('idle');
          appendMessage('system', 'Speech synthesis is unavailable in this browser.');
          debugVoice('tts:local-unavailable');
          return;
        }

        await new Promise<void>((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(safeText);
          utterance.rate = 1;
          utterance.pitch = 1;
          utterance.volume = isMuted ? 0 : 1;

          utterance.onstart = () => {
            setStatus('speaking');
            startLocalTtsPulse();
            debugVoice('tts:local-onstart');
          };

          utterance.onend = () => {
            stopLocalTtsPulse();
            setStatus(handsFreeDesiredRef.current ? 'listening' : 'idle');
            debugVoice('tts:local-onend');
            resolve();
          };

          utterance.onerror = (event) => {
            stopLocalTtsPulse();
            debugVoice('tts:local-onerror', event);
            reject(new Error('Local speech synthesis failed.'));
          };

          window.speechSynthesis.speak(utterance);
        });

        return;
      }

      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: safeText }),
      });

      debugVoice('tts:response', {
        ok: response.ok,
        status: response.status,
      });

      if (!response.ok) {
        const maybeError = (await response.json().catch(() => null)) as
          | {
              error?: { message?: string };
            }
          | null;

        throw new Error(maybeError?.error?.message || `TTS route failed with status ${response.status}.`);
      }

      const audioBlob = await response.blob();
      debugVoice('tts:audio-blob', {
        bytes: audioBlob.size,
        type: audioBlob.type,
      });
      const nextUrl = URL.createObjectURL(audioBlob);

      if (fallbackAudioObjectUrlRef.current) {
        URL.revokeObjectURL(fallbackAudioObjectUrlRef.current);
      }

      fallbackAudioObjectUrlRef.current = nextUrl;

      const audio = fallbackAudioRef.current;
      if (!audio) {
        return;
      }

      audio.src = nextUrl;
      audio.muted = isMuted;
      await monitorAudioElement(audio);

      setStatus('speaking');
      await audio.play();
      debugVoice('tts:play');
    },
    [appendMessage, isMuted, localMode, monitorAudioElement, startLocalTtsPulse, stopLocalTtsPulse],
  );

  const runFallbackTurn = useCallback(
    async (input: string) => {
      const userText = input.trim();
      if (!userText || turnInFlightRef.current) {
        debugVoice('fallback-turn:skip', {
          reason: !userText ? 'empty-input' : 'turn-in-flight',
        });
        return;
      }

      const nowMs = Date.now();
      const previous = lastFallbackTurnRef.current;
      if (previous.text === userText && nowMs - previous.atMs < 2500) {
        debugVoice('fallback-turn:skip', {
          reason: 'dedupe-window',
          input: userText,
        });
        return;
      }
      lastFallbackTurnRef.current = {
        text: userText,
        atMs: nowMs,
      };

      turnInFlightRef.current = true;
      debugVoice('fallback-turn:start', {
        input: userText,
      });

      try {
        appendMessage('user', userText);
        const turnId = Date.now();
        activeTurnIdRef.current = turnId;
        let hasQueuedSpeech = false;
        let speechQueue = Promise.resolve();

        const assistantText = await streamAssistantResponse(userText, {
          onSpeakableChunk: localMode
            ? (chunk) => {
                if (!chunk.trim()) {
                  return;
                }

                hasQueuedSpeech = true;
                speechQueue = speechQueue.then(async () => {
                  if (activeTurnIdRef.current !== turnId) {
                    return;
                  }
                  await synthesizeSpeech(chunk);
                });
              }
            : undefined,
        });

        if (hasQueuedSpeech) {
          await speechQueue;
        } else if (assistantText.trim()) {
          await synthesizeSpeech(assistantText);
        }
      } catch (error) {
        setStatus('error');
        appendSystemMessage(error instanceof Error ? error.message : 'Assistant response failed.');
      } finally {
        turnInFlightRef.current = false;
        debugVoice('fallback-turn:end');
      }
    },
    [appendMessage, appendSystemMessage, localMode, streamAssistantResponse, synthesizeSpeech],
  );

  const transcribeAudioBlob = useCallback(async (audioBlob: Blob): Promise<string> => {
    debugVoice('stt:request', {
      bytes: audioBlob.size,
      type: audioBlob.type,
    });

    const formData = new FormData();
    formData.append('audio', audioBlob, 'voice-input.webm');

    const response = await fetch('/api/voice/stt', {
      method: 'POST',
      body: formData,
    });

    debugVoice('stt:response', {
      ok: response.ok,
      status: response.status,
    });

    if (!response.ok) {
      const maybeError = (await response.json().catch(() => null)) as
        | {
            error?: { message?: string };
          }
        | null;

      throw new Error(maybeError?.error?.message || `STT route failed with status ${response.status}.`);
    }

    const json = (await response.json()) as { text?: string; backend?: string };
    const transcript = normalizeText(json.text);
    debugVoice('stt:parsed', {
      backend: json.backend,
      transcriptLength: transcript.length,
    });
    return transcript;
  }, []);

  const startFallbackRecording = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder is unavailable in this browser. Use hands-free mode or try a newer browser.');
    }

    const stream = await ensureMicrophoneStream();

    recordedChunksRef.current = [];
    const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

    const recorder = preferredMimeType
      ? new MediaRecorder(stream, {
          mimeType: preferredMimeType,
          audioBitsPerSecond: 128_000,
        })
      : new MediaRecorder(stream);

    debugVoice('recording:start', {
      preferredMimeType: preferredMimeType || 'browser-default',
    });

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
      setIsRecording(false);
      debugVoice('recording:stop', {
        bytes: blob.size,
      });

      if (blob.size < 1024) {
        setStatus('idle');
        return;
      }

      try {
        setStatus('thinking');
        const userText = await transcribeAudioBlob(blob);
        if (!userText) {
          setStatus('idle');
          return;
        }

        await runFallbackTurn(userText);
      } catch (error) {
        setStatus('error');
        appendSystemMessage(error instanceof Error ? error.message : 'Voice processing failed.');
      }
    };

    recorder.start();
    setIsRecording(true);
    setStatus('listening');
  }, [appendSystemMessage, ensureMicrophoneStream, runFallbackTurn, transcribeAudioBlob]);

  const handleRealtimeEvent = useCallback(
    (payload: unknown) => {
      const event = payload as Record<string, unknown>;
      const type = typeof event?.type === 'string' ? event.type : '';

      if (type === 'conversation.item.input_audio_transcription.completed') {
        const transcript = extractRealtimeUserTranscript(payload);
        if (transcript) {
          appendMessage('user', transcript);
          setStatus('thinking');
        }
      }

      const delta = extractRealtimeDeltaText(payload);
      if (delta) {
        appendAssistantDelta(delta);
        setStatus('speaking');
      }

      if (type === 'response.completed') {
        finalizeAssistantStream();
        setStatus(handsFreeDesiredRef.current ? 'listening' : 'idle');
      }

      if (type.includes('error')) {
        const message = normalizeText((event.error as Record<string, unknown> | undefined)?.message);
        setStatus('error');
        appendSystemMessage(message || 'Realtime event error occurred.');
      }
    },
    [appendAssistantDelta, appendMessage, appendSystemMessage, finalizeAssistantStream],
  );

  const connectRealtime = useCallback(async () => {
    if (localMode) {
      debugVoice('realtime:skip-local-mode');
      stopRealtimeConnection();
      setFallbackActive(true);
      setFallbackReason('Local model mode enabled: realtime WebRTC path is disabled.');
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    setRealtimeReady(false);
    debugVoice('realtime:connect-start');

    try {
      const sessionResponse = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!sessionResponse.ok) {
        const errorPayload = (await sessionResponse.json().catch(() => null)) as
          | {
              error?: { message?: string };
            }
          | null;

        throw new Error(errorPayload?.error?.message || 'Realtime session minting failed.');
      }

      const sessionData = (await sessionResponse.json()) as RealtimeSessionResponse;
      const ephemeralKey = sessionData.session?.client_secret?.value;
      const model = sessionData.session?.model || 'gpt-4o-realtime-preview';
      debugVoice('realtime:session', {
        ok: Boolean(ephemeralKey),
        model,
      });
      if (!ephemeralKey) {
        throw new Error('Realtime route returned no ephemeral client secret.');
      }

      stopRealtimeConnection();

      const stream = await ensureMicrophoneStream();
      const peerConnection = new RTCPeerConnection();
      stream.getAudioTracks().forEach((track) => {
        track.enabled = handsFreeDesiredRef.current;
        peerConnection.addTrack(track, stream);
      });

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudio.muted = isMuted;
      remoteAudio.onplay = () => {
        setStatus('speaking');
      };
      remoteAudio.onended = () => {
        setStatus(handsFreeDesiredRef.current ? 'listening' : 'idle');
      };

      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        if (!remoteStream) {
          return;
        }

        remoteAudio.srcObject = remoteStream;
        void monitorAudioElement(remoteAudio);
        void remoteAudio.play().catch(() => undefined);
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          setRealtimeReady(false);
          setFallbackActive(true);
          setFallbackReason('Realtime connection dropped. Switched to fallback voice pipeline.');
          setStatus('error');
        }
      };

      const dataChannel = peerConnection.createDataChannel('oai-events');
      dataChannel.onopen = () => {
        setRealtimeReady(true);
        setStatus(handsFreeDesiredRef.current ? 'listening' : 'idle');
      };
      dataChannel.onclose = () => {
        setRealtimeReady(false);
      };
      dataChannel.onmessage = (event) => {
        const payload = parseJsonSafe(event.data);
        if (payload) {
          handleRealtimeEvent(payload);
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp || '',
      });

      if (!sdpResponse.ok) {
        throw new Error(`Realtime SDP exchange failed (${sdpResponse.status}).`);
      }

      const answerSdp = await sdpResponse.text();
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      realtimeRef.current = {
        peerConnection,
        dataChannel,
        localStream: stream,
        remoteAudio,
      };

      setFallbackActive(false);
      setFallbackReason('');
      debugVoice('realtime:connect-success');
    } catch (error) {
      stopRealtimeConnection();
      setRealtimeReady(false);
      setFallbackActive(true);
      setFallbackReason(error instanceof Error ? error.message : 'Realtime setup failed.');
      setStatus('error');
      debugVoice('realtime:connect-error', error);
    }
  }, [ensureMicrophoneStream, handleRealtimeEvent, isMuted, localMode, monitorAudioElement, stopRealtimeConnection]);

  const enableRealtimeMic = useCallback((enabled: boolean) => {
    const stream = realtimeRef.current.localStream;
    if (!stream) {
      return;
    }

    stream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, []);

  const requestRealtimeResponse = useCallback(() => {
    const dataChannel = realtimeRef.current.dataChannel;
    if (!dataChannel || dataChannel.readyState !== 'open') {
      return;
    }

    dataChannel.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
        },
      }),
    );
  }, []);

  const startHoldToTalk = useCallback(async () => {
    try {
      if (localMode) {
        debugVoice('hold:start', { path: 'local-stt' });
        await startFallbackRecording();
        return;
      }

      if (!fallbackActive && realtimeConnected) {
        debugVoice('hold:start', { path: 'realtime' });
        enableRealtimeMic(true);
        setStatus('listening');
        return;
      }

      debugVoice('hold:start', { path: 'fallback-stt' });
      await startFallbackRecording();
    } catch (error) {
      setStatus('error');
      appendSystemMessage(error instanceof Error ? error.message : 'Unable to start microphone capture.');
      debugVoice('hold:start-error', error);
    }
  }, [
    appendSystemMessage,
    enableRealtimeMic,
    fallbackActive,
    localMode,
    realtimeConnected,
    startFallbackRecording,
  ]);

  const stopHoldToTalk = useCallback(() => {
    if (localMode) {
      debugVoice('hold:stop', { path: 'local-stt' });
      stopRecording();
      return;
    }

    if (!fallbackActive && realtimeConnected) {
      debugVoice('hold:stop', { path: 'realtime' });
      enableRealtimeMic(false);
      setStatus('thinking');
      requestRealtimeResponse();
      return;
    }

    debugVoice('hold:stop', { path: 'fallback-stt' });
    stopRecording();
  }, [enableRealtimeMic, fallbackActive, localMode, realtimeConnected, requestRealtimeResponse, stopRecording]);

  const startHandsFreeRecognition = useCallback(async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      appendSystemMessage('Hands-free mode requires SpeechRecognition support in this browser.');
      setStatus('error');
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setStatus('listening');
    };

    recognition.onresult = (rawEvent) => {
      const event = rawEvent as {
        resultIndex?: number;
        results?: ArrayLike<{
          isFinal?: boolean;
          0?: {
            transcript?: string;
          };
        }>;
      };

      const results = event.results;
      if (!results) {
        return;
      }

      const startIndex =
        typeof event.resultIndex === 'number' && Number.isInteger(event.resultIndex) && event.resultIndex >= 0
          ? event.resultIndex
          : 0;

      const finalizedChunks: string[] = [];

      for (let index = startIndex; index < results.length; index += 1) {
        const result = results[index];
        if (!result?.isFinal) {
          continue;
        }

        const transcript = normalizeText(result[0]?.transcript);
        if (transcript) {
          finalizedChunks.push(transcript);
        }
      }

      const mergedTranscript = normalizeText(finalizedChunks.join(' '));
      if (mergedTranscript) {
        debugVoice('handsfree:final-transcript', {
          text: mergedTranscript,
        });
        void runFallbackTurn(mergedTranscript);
      }
    };

    recognition.onerror = (event) => {
      setStatus('error');
      appendSystemMessage(toSpeechRecognitionErrorMessage(event));
    };

    recognition.onend = () => {
      if (handsFreeDesiredRef.current) {
        try {
          recognition.start();
        } catch {
          setStatus('error');
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [appendSystemMessage, runFallbackTurn]);

  const toggleHandsFree = useCallback(async () => {
    const nextActive = !handsFreeActive;
    setHandsFreeActive(nextActive);
    handsFreeDesiredRef.current = nextActive;

    if (!nextActive) {
      stopHandsFreeRecognition();
      enableRealtimeMic(false);
      setStatus('idle');
      return;
    }

    if (!fallbackActive && realtimeConnected) {
      enableRealtimeMic(true);
      setStatus('listening');
      return;
    }

    await startHandsFreeRecognition();
  }, [enableRealtimeMic, fallbackActive, handsFreeActive, realtimeConnected, startHandsFreeRecognition, stopHandsFreeRecognition]);

  const clearConversationMemory = useCallback(() => {
    activeTurnIdRef.current += 1;
    stopAllActivity();
    setMessages([]);
    lastFallbackTurnRef.current = { text: '', atMs: 0 };
    lastSystemErrorRef.current = { text: '', atMs: 0 };
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
    }
  }, [stopAllActivity]);

  const createWebGpuHostRenderer = useCallback(
    (canvas: HTMLCanvasElement, hooks: Parameters<typeof createWebGPUAvatarRenderer>[1]) =>
      createWebGPUAvatarRenderer(
        canvas,
        hooks,
        () => audioLevelRef.current,
        () => (avatarBlendshapesEnabledRef.current ? a2bsExternalExpressionRef.current : null),
      ),
    [],
  );

  const createWebGlHostRenderer = useCallback(
    (canvas: HTMLCanvasElement, hooks: Parameters<typeof createWebGL2AvatarRenderer>[1]) =>
      createWebGL2AvatarRenderer(
        canvas,
        hooks,
        () => audioLevelRef.current,
        () => (avatarBlendshapesEnabledRef.current ? a2bsExternalExpressionRef.current : null),
      ),
    [],
  );

  useEffect(() => {
    if (localMode) {
      setFallbackActive(true);
      setFallbackReason('Local model mode is active (no OpenAI API calls).');
    } else {
      void connectRealtime();
    }

    return () => {
      stopRecording();
      stopHandsFreeRecognition();
      stopRealtimeConnection();
      stopLocalSpeech();
      stopMeter();
      void stopA2bsStream();

      if (fallbackAudioObjectUrlRef.current) {
        URL.revokeObjectURL(fallbackAudioObjectUrlRef.current);
      }

      if (streamContainerRef.current) {
        streamContainerRef.current.getTracks().forEach((track) => track.stop());
        streamContainerRef.current = null;
        setHasMicStream(false);
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close();
      }
    };
  }, [
    connectRealtime,
    localMode,
    stopA2bsStream,
    stopHandsFreeRecognition,
    stopLocalSpeech,
    stopMeter,
    stopRealtimeConnection,
    stopRecording,
  ]);

  return (
    <div className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <GpuCanvasHost
            createWebGPU={createWebGpuHostRenderer}
            createWebGL2={createWebGlHostRenderer}
            showPromptControl={false}
            staticFallback={
              <div className="grid gap-4 text-center text-sm text-slate-300">
                <Image
                  src="/experiments/002-voice-driven-chatbot-avatar/poster.svg"
                  alt="Voice Driven Chatbot Avatar static fallback"
                  width={900}
                  height={520}
                  className="h-auto w-full max-w-3xl rounded-xl border border-white/10"
                />
                <div className="space-y-1">
                  <p className="font-medium text-slate-100">3D avatar rendering is unavailable on this device/browser.</p>
                  <p>Voice chat still functions through transcript and audio pipeline fallback.</p>
                </div>
              </div>
            }
          />
        </div>

        <div className="space-y-4">
        <Card className="space-y-4 border-white/15 bg-slate-900/70">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Voice Controls</h2>
            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.15em] text-cyan-200">
              {status}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setInteractionMode('hold')}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                interactionMode === 'hold'
                  ? 'border-cyan-300 bg-cyan-300/10 text-cyan-100'
                  : 'border-white/20 text-slate-200 hover:bg-white/10'
              }`}
            >
              Hold-to-talk
            </button>
            <button
              type="button"
              onClick={() => setInteractionMode('hands-free')}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                interactionMode === 'hands-free'
                  ? 'border-cyan-300 bg-cyan-300/10 text-cyan-100'
                  : 'border-white/20 text-slate-200 hover:bg-white/10'
              }`}
            >
              Hands-free
            </button>
          </div>

          <div className="space-y-2 rounded-xl border border-white/15 bg-slate-950/45 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Assistant Role</p>
              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Editable</span>
            </div>
            <textarea
              value={rolePrompt}
              onChange={(event) => setRolePrompt(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-white/15 bg-slate-950/80 px-3 py-2 text-xs leading-relaxed text-slate-100 outline-none transition focus:border-cyan-300/60"
              placeholder={DEFAULT_ROLE_PROMPT}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setRolePrompt(DEFAULT_ROLE_PROMPT)}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
              >
                Reset role
              </button>
              <button
                type="button"
                onClick={clearConversationMemory}
                className="rounded-lg border border-rose-300/35 bg-rose-400/12 px-3 py-1.5 text-xs text-rose-100 transition hover:bg-rose-400/20"
              >
                Clear memory
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={() => setAvatarBlendshapesEnabled((current) => !current)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                  avatarBlendshapesEnabled
                    ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/20'
                    : 'border-white/20 bg-slate-900/50 text-slate-200 hover:bg-white/10'
                }`}
              >
                <AudioLines size={14} />
                {avatarBlendshapesEnabled ? 'Disable Avatar / Blendshapes' : 'Enable Avatar / Blendshapes'}
              </button>
              <div
                className={`rounded-lg border px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] ${
                  a2bsStatus === 'connected'
                    ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100'
                    : a2bsStatus === 'connecting'
                      ? 'border-amber-300/45 bg-amber-500/10 text-amber-100'
                      : 'border-white/20 bg-slate-900/60 text-slate-300'
                }`}
              >
                A2BS: {a2bsStatus}
              </div>
            </div>
          </div>

          {interactionMode === 'hold' ? (
            <button
              type="button"
              onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                void startHoldToTalk();
              }}
              onMouseUp={(event) => {
                event.preventDefault();
                stopHoldToTalk();
              }}
              onMouseLeave={(event) => {
                event.preventDefault();
                stopHoldToTalk();
              }}
              onTouchStart={(event) => {
                event.preventDefault();
                void startHoldToTalk();
              }}
              onTouchEnd={(event) => {
                event.preventDefault();
                stopHoldToTalk();
              }}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                isRecording || status === 'listening'
                  ? 'border-rose-300 bg-rose-400/20 text-rose-100'
                  : 'border-cyan-300 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20'
              }`}
            >
              <Mic size={16} />
              {isRecording || status === 'listening' ? 'Release to send' : 'Hold to talk'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                void toggleHandsFree();
              }}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition ${
                handsFreeActive
                  ? 'border-emerald-300 bg-emerald-400/20 text-emerald-100'
                  : 'border-cyan-300 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20'
              }`}
            >
              <Radio size={16} />
              {handsFreeActive ? 'Stop hands-free' : 'Start hands-free'}
            </button>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setIsMuted((current) => !current)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>

            <button
              type="button"
              onClick={stopAllActivity}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              <Square size={14} />
              Stop
            </button>
          </div>

          {!localMode ? (
            <button
              type="button"
              onClick={() => {
                void connectRealtime();
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              <RefreshCw size={14} />
              Reconnect Realtime
            </button>
          ) : (
            <p className="rounded-xl border border-white/15 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
              Local mode active. Realtime/WebRTC is disabled and no OpenAI API calls are used.
            </p>
          )}
        </Card>

        <Card className="space-y-3 border-white/15 bg-slate-900/70">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-100">Live Chat</h3>
            <p className="text-[11px] text-slate-400">
              Conversation is persisted locally. Recent turns are sent directly and older turns are summarized as memory.
            </p>
          </div>
          <div className="max-h-[360px] space-y-2 overflow-auto rounded-xl border border-white/10 bg-slate-950/60 p-3">
            {messages.length === 0 ? (
              <p className="text-xs text-slate-400">No transcript yet. Start speaking to begin.</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'assistant' ? 'justify-end' : message.role === 'user' ? 'justify-start' : 'justify-center'}`}
                >
                  <div
                    className={`max-w-[86%] rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'border border-emerald-300/35 bg-emerald-500/16 text-emerald-50'
                        : message.role === 'assistant'
                          ? 'border border-sky-300/35 bg-sky-500/16 text-sky-50'
                          : 'w-full border border-rose-300/40 bg-rose-500/16 text-rose-100'
                    }`}
                  >
                    <p className="mb-1 text-[10px] uppercase tracking-[0.16em] opacity-80">
                      {message.role === 'user' ? 'transcription' : message.role === 'assistant' ? 'llm' : 'system'}
                      {message.streaming ? ' (streaming)' : ''}
                    </p>
                    <p>{message.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="space-y-3 border-white/15 bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-100">Avatar / Blendshapes</h3>
            <span
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${
                a2bsStatus === 'connected'
                  ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100'
                  : a2bsStatus === 'connecting'
                    ? 'border-amber-300/45 bg-amber-500/10 text-amber-100'
                    : 'border-white/20 bg-slate-950/70 text-slate-300'
              }`}
            >
              {a2bsStatus}
            </span>
          </div>
          <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-slate-950/55 px-2 py-1.5">
              Blendshape FPS: <span className="font-medium text-slate-100">{a2bsFps > 0 ? a2bsFps.toFixed(1) : '0.0'}</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/55 px-2 py-1.5">
              RTT: <span className="font-medium text-slate-100">{a2bsRttMs == null ? '-' : `${a2bsRttMs.toFixed(0)}ms`}</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/55 px-2 py-1.5">
              Dropped: <span className="font-medium text-slate-100">{a2bsDroppedFrames}</span>
            </div>
          </div>
          {a2bsError ? (
            <p className="rounded-lg border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-xs leading-relaxed text-rose-100">
              {a2bsError}
            </p>
          ) : (
            <p className="rounded-lg border border-white/10 bg-slate-950/55 px-3 py-2 text-xs text-slate-300">
              WebSocket: <span className="font-mono text-slate-200">{process.env.NEXT_PUBLIC_A2BS_WS_URL ?? 'ws://localhost:8765/ws/a2bs'}</span>
            </p>
          )}
          <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/60 p-3">
            {A2BS_BAR_KEYS.map((key) => {
              const value = Math.min(1, Math.max(0, a2bsBars[key] ?? 0));
              return (
                <div key={key} className="grid grid-cols-[110px_1fr_42px] items-center gap-2 text-[11px]">
                  <span className="font-mono text-slate-400">{key}</span>
                  <div className="h-2 overflow-hidden rounded bg-white/10">
                    <div className="h-full rounded bg-cyan-300/80 transition-all duration-75" style={{ width: `${value * 100}%` }} />
                  </div>
                  <span className="text-right font-mono text-slate-300">{value.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </Card>
        </div>
      </div>

      {fallbackActive ? (
        <Card className="ml-auto max-w-xl border-amber-300/70 bg-slate-950/95 text-amber-50 shadow-[0_0_0_1px_rgba(252,211,77,0.2)]">
          <p className="text-sm font-semibold tracking-wide text-amber-100">Fallback Voice Pipeline Active</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-50/95">
            {fallbackReason || 'Realtime/WebRTC unavailable. Using browser speech recognition and local model chat.'}
          </p>
        </Card>
      ) : null}

      <audio
        ref={fallbackAudioRef}
        className="hidden"
        onEnded={() => {
          setStatus(handsFreeActive ? 'listening' : 'idle');
          stopMeter();
        }}
        onPause={() => {
          if (status !== 'speaking') {
            stopMeter();
          }
        }}
      />
    </div>
  );
}
