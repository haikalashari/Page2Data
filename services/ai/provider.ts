import type { AiProviderId, AiSettings } from '@/types/ai';

export interface CompletionRequest {
  settings: AiSettings;
  system: string;
  user: string;
  signal?: AbortSignal;
  /** Ask for JSON output when the provider supports a JSON mode. */
  json?: boolean;
}

export interface AiProviderAdapter {
  id: AiProviderId;
  label: string;
  /** True when the user must supply a base URL. */
  requiresBaseUrl: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  complete(request: CompletionRequest): Promise<string>;
  listModels?(settings: AiSettings, signal?: AbortSignal): Promise<string[]>;
}

export class AiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AiError';
    this.status = status;
  }
}

export const REQUEST_TIMEOUT_MS = 60_000;

export function combineSignals(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);
  return timeout;
}

function readProviderError(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | Array<{ message?: string }>;
      message?: string;
    };
    const nested = Array.isArray(parsed.error) ? parsed.error[0]?.message : parsed.error?.message;
    const message = nested ?? parsed.message;
    if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 300);
  } catch {
    // Fall through to the raw body.
  }
  return body.trim().slice(0, 300);
}

export function describeHttpError(status: number, body: string): string {
  const detail = readProviderError(body);

  if (status === 401 || status === 403) {
    return 'Authentication failed. Check that your API key is valid for this provider.';
  }
  if (status === 404) {
    return detail
      ? `Endpoint or model not found: ${detail}`
      : 'Endpoint or model not found. Check the model name and base URL.';
  }
  if (status === 429) {
    return 'Rate limit or quota reached. Wait a moment, or check your provider plan.';
  }
  if (status >= 500) {
    return `The AI provider had a server error (${status}). Try again shortly.`;
  }
  return detail ? `${detail} (HTTP ${status})` : `The AI provider rejected the request (HTTP ${status}).`;
}

export interface JsonRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
}

/** POSTs JSON and returns the parsed response, with friendly error messages. */
export async function postJson<T = unknown>({ url, headers, body, signal }: JsonRequest): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: combineSignals(signal),
    });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === 'AbortError') throw new AiError('Request cancelled.');
    if (name === 'TimeoutError') throw new AiError('The AI provider took too long to respond. Try again.');
    throw new AiError('Could not reach the AI provider. Check your connection and endpoint.');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new AiError(describeHttpError(response.status, text), response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new AiError('The AI provider returned a response that was not JSON.');
  }
}

export function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

export function apiKeyHeader(apiKey: string): Record<string, string> {
  return { authorization: `Bearer ${apiKey.trim()}` };
}
