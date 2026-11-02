import type { AiSettings } from '@/types/ai';
import {
  AiError,
  apiKeyHeader,
  chatCompletionsUrl,
  postJson,
  type AiProviderAdapter,
} from '../provider';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
}

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';

function readContent(response: ChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
  }
  return '';
}

function shouldRetryWithoutParameters(error: unknown): boolean {
  return (
    error instanceof AiError &&
    error.status === 400 &&
    /temperature|max_tokens|max completion tokens|unsupported parameter|unknown parameter|not supported/i.test(
      error.message,
    )
  );
}

export interface ChatCompletionInput {
  settings: AiSettings;
  system: string;
  user: string;
  signal?: AbortSignal;
  json?: boolean;
  /** Some servers only support max_tokens, others only max_completion_tokens. */
  tokenField?: 'max_tokens' | 'max_completion_tokens';
  /** Compatible servers often reject response_format. */
  supportsJsonMode?: boolean;
  baseUrl: string;
}

export async function requestChatCompletion(input: ChatCompletionInput): Promise<string> {
  const {
    settings,
    system,
    user,
    signal,
    json = false,
    tokenField = 'max_tokens',
    supportsJsonMode = true,
    baseUrl,
  } = input;

  const buildBody = (options: { temperature: boolean; tokenField: 'max_tokens' | 'max_completion_tokens' }) => ({
    model: settings.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    ...(json && supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(options.temperature ? { temperature: settings.temperature } : {}),
    [options.tokenField]: settings.maxTokens,
  });

  const send = async (body: Record<string, unknown>) =>
    postJson<ChatCompletionResponse>({
      url: chatCompletionsUrl(baseUrl),
      headers: apiKeyHeader(settings.apiKey),
      body,
      signal,
    });

  let response: ChatCompletionResponse;
  try {
    response = await send(buildBody({ temperature: true, tokenField }));
  } catch (error) {
    if (!shouldRetryWithoutParameters(error)) throw error;

    // Newer OpenAI models reject temperature and use max_completion_tokens.
    try {
      response = await send(buildBody({ temperature: false, tokenField: 'max_completion_tokens' }));
    } catch (retryError) {
      if (retryError instanceof AiError) throw retryError;
      throw error;
    }
  }

  if (response.error?.message) throw new AiError(response.error.message);
  const content = readContent(response);
  if (!content.trim()) {
    throw new AiError('The AI provider returned an empty response. Try a different model.');
  }
  return content;
}

export const openaiAdapter: AiProviderAdapter = {
  id: 'openai',
  label: 'OpenAI',
  requiresBaseUrl: false,
  defaultBaseUrl: OPENAI_DEFAULT_BASE_URL,
  defaultModel: OPENAI_DEFAULT_MODEL,

  complete({ settings, system, user, signal, json }) {
    return requestChatCompletion({
      settings,
      system,
      user,
      signal,
      json,
      baseUrl: settings.baseUrl || OPENAI_DEFAULT_BASE_URL,
    });
  },

  async listModels(settings, signal) {
    const base = (settings.baseUrl || OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, '');
    const response = await fetch(`${base}/models`, {
      headers: apiKeyHeader(settings.apiKey),
      signal,
    });
    if (!response.ok) {
      throw new AiError('Could not load models. Check your API key and base URL.', response.status);
    }
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    return (payload.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => typeof id === 'string')
      .sort();
  },
};
