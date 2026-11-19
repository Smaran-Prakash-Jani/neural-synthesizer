// The providers a visitor can bring a key for. Anthropic goes through the official Anthropic SDK;
// the rest speak the OpenAI-compatible chat API and are called with plain fetch, which only sends
// the Authorization and Content-Type headers every one of them allows from a browser.

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek' | 'mistral' | 'groq' | 'openrouter';

export type Provider = {
  id: ProviderId;
  name: string;
  /** Where the key (and nothing else) is sent. */
  host: string;
  /** OpenAI-compatible base URL, without a trailing slash. */
  baseURL?: string;
  keyPlaceholder: string;
  keyPrefix?: string;
  keysUrl: string;
  /** Sends stream_options.include_usage to get token counts (Mistral rejects unknown fields). */
  usageOption?: boolean;
  /** The model list can be read without a key. */
  publicModels?: boolean;
};

export const PROVIDERS: Provider[] = [
  { id: 'anthropic', name: 'Anthropic', host: 'api.anthropic.com', keyPlaceholder: 'sk-ant-...', keyPrefix: 'sk-ant-', keysUrl: 'https://platform.claude.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', host: 'api.openai.com', baseURL: 'https://api.openai.com/v1', keyPlaceholder: 'sk-...', keyPrefix: 'sk-', keysUrl: 'https://platform.openai.com/api-keys', usageOption: true },
  { id: 'google', name: 'Google', host: 'generativelanguage.googleapis.com', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', keyPlaceholder: 'Your Gemini API key', keysUrl: 'https://aistudio.google.com/apikey', usageOption: true },
  { id: 'xai', name: 'xAI', host: 'api.x.ai', baseURL: 'https://api.x.ai/v1', keyPlaceholder: 'xai-...', keyPrefix: 'xai-', keysUrl: 'https://console.x.ai', usageOption: true },
  { id: 'deepseek', name: 'DeepSeek', host: 'api.deepseek.com', baseURL: 'https://api.deepseek.com', keyPlaceholder: 'sk-...', keyPrefix: 'sk-', keysUrl: 'https://platform.deepseek.com/api_keys', usageOption: true },
  { id: 'mistral', name: 'Mistral', host: 'api.mistral.ai', baseURL: 'https://api.mistral.ai/v1', keyPlaceholder: 'Your Mistral key', keysUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'groq', name: 'Groq', host: 'api.groq.com', baseURL: 'https://api.groq.com/openai/v1', keyPlaceholder: 'gsk_...', keyPrefix: 'gsk_', keysUrl: 'https://console.groq.com/keys', usageOption: true },
  { id: 'openrouter', name: 'OpenRouter', host: 'openrouter.ai', baseURL: 'https://openrouter.ai/api/v1', keyPlaceholder: 'sk-or-...', keyPrefix: 'sk-or-', keysUrl: 'https://openrouter.ai/settings/keys', usageOption: true, publicModels: true },
];

export const providerById = (id: ProviderId) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

export type ModelOption = { id: string; label: string; note?: string; group?: string };

/** Claude models, tuned per model in anthropic.ts. US$ per million tokens. */
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Best balance of quality and cost. Recommended.', price: { in: 4, out: 20, write: 5, read: 0.2 } },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Faster and about half the price of Opus.', price: { in: 2, out: 10, write: 2.5, read: 0.1 } },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fastest and cheapest. Simpler results.', price: { in: 0.1, out: 0.5, write: 0.125, read: 0.01 } },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2', note: 'Most capable and the most expensive.', price: { in: 8, out: 40, write: 10, read: 0.2 } },
] as const;

export const DEFAULT_CLAUDE = CLAUDE_MODELS[0].id;

export function claudeLabel(id: string) {
  return CLAUDE_MODELS.find((m) => m.id === id)?.label ?? id;
}

/** A readable name for any model ID: Claude's own labels, "Gemini 4 Carbon" for gemini-4-carbon. */
export function modelLabel(id: string) {
  const bare = id.replace(/^models\//, '');
  const claude = CLAUDE_MODELS.find((m) => m.id === bare);
  if (claude) return claude.label;
  if (/^gemini-/.test(bare)) return bare.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return bare;
}

// Models that can't write a component: embeddings, speech, images, video, moderation and so on.
const NOT_CHAT = /embed|whisper|tts|audio|speech|transcri|moderation|guard|dall-e|imagen|image|imagine|video|veo|sora|omni|realtime|ocr|rerank|babbage|davinci|aqa|lyria|native-audio|-live|banana|computer-use|:batch/i;

type RawModel = { id: string; created?: number; name?: string };

/** Reads the provider's live model list with the visitor's key, newest first. */
export async function listModels(provider: Provider, key: string, signal?: AbortSignal): Promise<ModelOption[]> {
  if (!provider.baseURL) return [];
  const res = await fetch(`${provider.baseURL}/models`, {
    headers: provider.publicModels && !key ? {} : { Authorization: `Bearer ${key}` },
    signal,
  });
  if (!res.ok) throw new ProviderError(provider, res.status, await readError(res));
  const body = (await res.json()) as { data?: RawModel[]; models?: RawModel[] };
  const raw = (body.data ?? body.models ?? []).map((m) => ({ ...m, id: m.id.replace(/^models\//, '') }));
  const seen = new Set<string>();
  return raw
    .filter((m) => m.id && !NOT_CHAT.test(m.id) && !seen.has(m.id) && seen.add(m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || b.id.localeCompare(a.id))
    .map((m) => ({
      id: m.id,
      label: provider.id === 'openrouter' && m.name ? m.name : m.id,
      group: provider.id === 'openrouter' ? m.id.split('/')[0] : undefined,
    }));
}

export class ProviderError extends Error {
  constructor(
    public provider: Provider,
    public status: number,
    detail: string,
  ) {
    super(detail || `HTTP ${status}`);
  }
}

/** Some providers send HTML entities in plain-text error messages ("Plans &amp; Billing"). */
export function plainText(message: string) {
  return message
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    type Body = { error?: { message?: string } | string; message?: string; detail?: string };
    const parsed = JSON.parse(text) as Body | Body[];
    const body = Array.isArray(parsed) ? parsed[0] ?? {} : parsed; // Google can wrap the error in a list
    if (typeof body.error === 'string') return plainText(body.error);
    return plainText(body.error?.message || body.message || body.detail || text.slice(0, 300));
  } catch {
    return plainText(text.slice(0, 300));
  }
}
