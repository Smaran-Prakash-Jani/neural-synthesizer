import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODELS, plainText } from './providers';
import type { GenerateRequest, GenerateResult, StreamHandlers } from './types';

/**
 * Streams from Claude straight from the browser with the visitor's own key. The key only ever goes
 * to api.anthropic.com (the page's CSP allows no other Anthropic host).
 */
export async function streamClaude(req: GenerateRequest, on: StreamHandlers): Promise<GenerateResult> {
  const client = new Anthropic({ apiKey: req.key, dangerouslyAllowBrowser: true, maxRetries: 1 });
  // Haiku 5.5 has no server-side fallback; the other Claude models retry a declined request on
  // Anthropic's recommended model within the same call.
  const fallback = req.model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
  const build = req.job === 'build';

  const stream = client.beta.messages.stream(
    {
      model: req.model,
      max_tokens: build ? 64000 : 4000,
      // These models always think; the summary is shown in the log so the wait isn't silent.
      thinking: { type: 'adaptive', display: build ? 'summarized' : 'omitted' },
      output_config: { effort: build ? 'medium' : 'low' },
      ...fallback,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: req.user }],
    },
    { signal: req.signal },
  );

  let text = '';
  for await (const event of stream) {
    if (event.type === 'content_block_start' && event.content_block.type === 'fallback') {
      on.onFallback?.(event.content_block.to.model);
    } else if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        text += event.delta.text;
        on.onText(event.delta.text);
      } else if (event.delta.type === 'thinking_delta') {
        on.onThinking(event.delta.thinking);
      }
    }
  }
  const message = await stream.finalMessage();
  const u = message.usage;
  const price = CLAUDE_MODELS.find((m) => m.id === req.model)?.price;
  const ran = message.model; // differs from the request after a fallback
  return {
    text,
    stop: message.stop_reason === 'refusal' ? 'refusal' : message.stop_reason === 'max_tokens' ? 'length' : 'end',
    model: ran,
    inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
    cost:
      price && ran === req.model
        ? ((u.input_tokens ?? 0) * price.in + (u.cache_creation_input_tokens ?? 0) * price.write + (u.cache_read_input_tokens ?? 0) * price.read + (u.output_tokens ?? 0) * price.out) / 1_000_000
        : undefined,
  };
}

/** A plain-English message for anything the Anthropic SDK can throw, or null if it isn't one. */
export function describeClaudeError(err: unknown, modelLabel: string): string | null {
  if (err instanceof Anthropic.APIUserAbortError) return 'Stopped.';
  if (err instanceof Anthropic.AuthenticationError) return 'Anthropic rejected that key. Check it in the Claude Console and paste it again.';
  if (err instanceof Anthropic.PermissionDeniedError) return `This key isn't allowed to use ${modelLabel}.`;
  if (err instanceof Anthropic.NotFoundError) return `${modelLabel} isn't available to this key.`;
  if (err instanceof Anthropic.RateLimitError) return 'Your Anthropic key hit its rate limit. Wait a minute and try again.';
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach api.anthropic.com. Check your connection and try again.";
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || (err.status ?? 0) >= 500) return "Anthropic's API is busy right now. Try again in a moment.";
    const body = err.error as { error?: { message?: string } } | undefined;
    return plainText(body?.error?.message || err.message);
  }
  return null;
}
