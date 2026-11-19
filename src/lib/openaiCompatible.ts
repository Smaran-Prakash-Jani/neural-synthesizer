import { ProviderError, readError, type Provider } from './providers';
import type { GenerateRequest, GenerateResult, StreamHandlers } from './types';

type Chunk = {
  model?: string;
  error?: { message?: string } | string;
  choices?: { delta?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

/** Streams a chat completion from any OpenAI-compatible provider, with the visitor's key. */
export async function streamCompatible(provider: Provider, req: GenerateRequest, on: StreamHandlers): Promise<GenerateResult> {
  const send = (withUsage: boolean) =>
    fetch(`${provider.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${req.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        stream: true,
        ...(withUsage ? { stream_options: { include_usage: true } } : {}),
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      }),
      signal: req.signal,
    });

  let res = await send(!!provider.usageOption);
  if (!res.ok && res.status === 400 && provider.usageOption) {
    // a provider (or one of its models) that doesn't take stream_options: ask again without it.
    // A rejected request isn't billed.
    const detail = await readError(res);
    if (!/stream_options|include_usage|unknown|unrecogni[sz]ed|extra|not (allowed|permitted|supported)/i.test(detail)) {
      throw new ProviderError(provider, 400, detail);
    }
    res = await send(false);
  }
  if (!res.ok || !res.body) throw new ProviderError(provider, res.status, await readError(res));

  let text = '';
  let finish: string | null | undefined;
  let model = req.model;
  let usage: Chunk['usage'] = null;

  for await (const data of sse(res.body)) {
    let chunk: Chunk;
    try {
      chunk = JSON.parse(data) as Chunk;
    } catch {
      continue;
    }
    if (chunk.error) {
      throw new ProviderError(provider, 200, typeof chunk.error === 'string' ? chunk.error : chunk.error.message || 'The provider reported an error.');
    }
    if (chunk.model) model = chunk.model;
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    const thought = choice.delta?.reasoning_content ?? choice.delta?.reasoning;
    if (thought) on.onThinking(thought);
    const piece = choice.delta?.content;
    if (piece) {
      text += piece;
      on.onText(piece);
    }
    if (choice.finish_reason) finish = choice.finish_reason;
  }

  return {
    text,
    stop: finish === 'length' ? 'length' : finish === 'content_filter' ? 'refusal' : 'end',
    model,
    inputTokens: usage?.prompt_tokens,
    outputTokens: usage?.completion_tokens,
  };
}

/** Yields the data payloads of a server-sent event stream until [DONE]. Comment lines are skipped. */
async function* sse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        if (data) yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** A plain-English message for a failed request to an OpenAI-compatible provider. */
export function describeCompatibleError(err: unknown, provider: Provider, model: string): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'Stopped.';
  if (err instanceof ProviderError) {
    const { status, message } = err;
    // Google and xAI answer a bad key with a 400 rather than a 401
    if (status === 401 || status === 403 || (status === 400 && /api.?key/i.test(message))) return `${provider.name} rejected that key. ${message}`;
    if (status === 402) return `Your ${provider.name} account is out of credit. ${message}`;
    if (status === 404) return `${provider.name} couldn't find the model "${model}" for this key. ${message}`;
    if (status === 429) return `${provider.name} says you've hit a rate limit or run out of quota. ${message}`;
    if (status >= 500) return `${provider.name} is having trouble right now${message ? ` (${message.replace(/\.$/, '')})` : ''}. Try again in a moment.`;
    return `${provider.name}: ${message}`;
  }
  if (err instanceof TypeError) return `Couldn't reach ${provider.host}. Check your connection and try again.`;
  return err instanceof Error ? err.message : String(err);
}
