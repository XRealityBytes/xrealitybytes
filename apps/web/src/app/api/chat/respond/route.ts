import { getOpenAiApiKey, jsonError, parseJsonBody, toOpenAiAuthHeader, trimString } from '@/lib/server/openai';

type HistoryItem = {
  role?: unknown;
  text?: unknown;
};

type ChatRequestPayload = {
  input?: unknown;
  history?: unknown;
  systemPrompt?: unknown;
  memory?: unknown;
};

type NormalizedMessage = {
  role: 'user' | 'assistant';
  text: string;
};

const SYSTEM_PROMPT =
  'You are the XRealityBytes Lab assistant. Keep answers concise, technically grounded, and helpful for experimental prototyping.';
const MAX_SYSTEM_PROMPT_CHARS = 2000;
const MAX_MEMORY_CHARS = 3500;

function resolveSystemPrompt(input: unknown): string {
  const custom = trimString(input).slice(0, MAX_SYSTEM_PROMPT_CHARS);
  if (custom) {
    return custom;
  }

  const fromEnv = trimString(process.env.XRB_DEFAULT_SYSTEM_PROMPT).slice(0, MAX_SYSTEM_PROMPT_CHARS);
  if (fromEnv) {
    return fromEnv;
  }

  return SYSTEM_PROMPT;
}

function resolveMemory(input: unknown): string {
  return trimString(input).slice(0, MAX_MEMORY_CHARS);
}

function sanitizeHistory(input: unknown): NormalizedMessage[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: NormalizedMessage[] = [];

  for (const item of input) {
    const candidate = item as HistoryItem;
    const role = candidate.role === 'assistant' ? 'assistant' : candidate.role === 'user' ? 'user' : null;
    if (!role) {
      continue;
    }

    const text = trimString(candidate.text).slice(0, 1000);
    if (!text) {
      continue;
    }

    normalized.push({ role, text });
  }

  return normalized.slice(-12);
}

function toSseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

function parseJsonLine(input: string): Record<string, unknown> | null {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type OllamaTagModel = {
  name?: unknown;
  model?: unknown;
};

type OllamaTagsPayload = {
  models?: unknown;
};

function extractOllamaModelNames(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const models = (payload as OllamaTagsPayload).models;
  if (!Array.isArray(models)) {
    return [];
  }

  return models
    .map((entry) => {
      const candidate = entry as OllamaTagModel;
      const primary = trimString(candidate.name);
      if (primary) {
        return primary;
      }

      const secondary = trimString(candidate.model);
      return secondary;
    })
    .filter(Boolean);
}

async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/tags`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as unknown;
    return extractOllamaModelNames(payload);
  } catch {
    return [];
  }
}

async function runOllamaChatRequest(
  endpoint: string,
  model: string,
  input: string,
  history: NormalizedMessage[],
  systemPrompt: string,
  memory: string,
): Promise<Response> {
  const memoryPrompt = memory ? `Conversation memory:\n${memory}` : '';

  return await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(memoryPrompt ? [{ role: 'system', content: memoryPrompt }] : []),
        ...history.map((message) => ({ role: message.role, content: message.text })),
        { role: 'user', content: input },
      ],
    }),
    cache: 'no-store',
  });
}

function createOllamaSseStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      let buffer = '';
      let sentDone = false;

      const emit = (line: string) => {
        controller.enqueue(encoder.encode(line));
      };

      const handleLine = (line: string) => {
        const parsed = parseJsonLine(line);
        if (!parsed) {
          return;
        }

        const message = parsed.message as Record<string, unknown> | undefined;
        const messageDelta = typeof message?.content === 'string' ? message.content : '';
        const generateDelta = typeof parsed.response === 'string' ? parsed.response : '';
        const delta = messageDelta || generateDelta;

        if (delta.length > 0) {
          emit(`data: ${JSON.stringify({ delta })}\n\n`);
        }

        const errorMessage = trimString(parsed.error);
        if (errorMessage) {
          emit(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        }

        if (parsed.done === true && !sentDone) {
          emit('data: [DONE]\n\n');
          sentDone = true;
        }
      };

      try {
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
            if (!line) {
              continue;
            }
            handleLine(line);
          }
        }

        if (buffer.trim()) {
          handleLine(buffer.trim());
        }

        if (!sentDone) {
          emit('data: [DONE]\n\n');
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

async function streamWithOllama(
  input: string,
  history: NormalizedMessage[],
  systemPrompt: string,
  memory: string,
): Promise<Response> {
  const baseUrl = trimString(process.env.OLLAMA_BASE_URL) || 'http://127.0.0.1:11434';
  const model = trimString(process.env.OLLAMA_MODEL) || 'llama3.2:1b';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/chat`;

  let response: Response;
  try {
    response = await runOllamaChatRequest(endpoint, model, input, history, systemPrompt, memory);
  } catch {
    return jsonError(502, 'UPSTREAM_ERROR', `Unable to reach local model backend at ${endpoint}.`);
  }

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    const modelMissing = response.status === 404 && /not found/i.test(errorText);

    if (modelMissing) {
      const availableModels = await listOllamaModels(baseUrl);
      const fallbackModel = availableModels.find((name) => name !== model);

      if (fallbackModel) {
        try {
          const retry = await runOllamaChatRequest(endpoint, fallbackModel, input, history, systemPrompt, memory);
          if (retry.ok && retry.body) {
            return new Response(createOllamaSseStream(retry.body), {
              status: 200,
              headers: toSseHeaders(),
            });
          }
        } catch {
          return jsonError(502, 'UPSTREAM_ERROR', `Unable to reach local model backend at ${endpoint}.`);
        }

        return jsonError(
          response.status || 502,
          'UPSTREAM_ERROR',
          `Configured model '${model}' is missing. Auto-fallback model '${fallbackModel}' also failed.`,
        );
      }

      return jsonError(
        404,
        'UPSTREAM_ERROR',
        `Local model '${model}' not found. Pull it with 'pnpm model:pull ${model}' or set OLLAMA_MODEL to an installed model.`,
      );
    }

    return jsonError(response.status || 502, 'UPSTREAM_ERROR', `Local model chat failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  return new Response(createOllamaSseStream(response.body), {
    status: 200,
    headers: toSseHeaders(),
  });
}

async function streamWithOpenAi(
  input: string,
  history: NormalizedMessage[],
  systemPrompt: string,
  memory: string,
): Promise<Response> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return jsonError(500, 'INTERNAL_ERROR', 'OPENAI_API_KEY is not configured on the server.');
  }

  const model = process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4.1-mini';

  const memoryPrompt = memory ? `Conversation memory:\n${memory}` : '';

  const responseBody = {
    model,
    stream: true,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: systemPrompt,
          },
        ],
      },
      ...(memoryPrompt
        ? [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text: memoryPrompt,
                },
              ],
            },
          ]
        : []),
      ...history.map((message) => ({
        role: message.role,
        content: [
          {
            type: 'input_text',
            text: message.text,
          },
        ],
      })),
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: input,
          },
        ],
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        ...toOpenAiAuthHeader(apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(responseBody),
      cache: 'no-store',
    });
  } catch {
    return jsonError(502, 'UPSTREAM_ERROR', 'Unable to reach OpenAI chat response service.');
  }

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    return jsonError(
      response.status || 502,
      response.status === 401 ? 'UNAUTHORIZED' : 'OPENAI_ERROR',
      `Chat response failed (${response.status}): ${errorText.slice(0, 300)}`,
    );
  }

  return new Response(response.body, {
    status: 200,
    headers: toSseHeaders(),
  });
}

export async function POST(request: Request) {

  const payload = await parseJsonBody<ChatRequestPayload>(request);
  if (!payload) {
    return jsonError(400, 'BAD_REQUEST', 'Invalid JSON payload.');
  }

  const input = trimString(payload.input).slice(0, 2000);
  if (!input) {
    return jsonError(400, 'BAD_REQUEST', 'Missing required "input" text.');
  }

  const history = sanitizeHistory(payload.history);
  const systemPrompt = resolveSystemPrompt(payload.systemPrompt);
  const memory = resolveMemory(payload.memory);
  const backend = trimString(process.env.XRB_CHAT_BACKEND).toLowerCase();
  if (backend === 'openai') {
    return streamWithOpenAi(input, history, systemPrompt, memory);
  }

  return streamWithOllama(input, history, systemPrompt, memory);
}
