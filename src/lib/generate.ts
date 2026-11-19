import { claudeLabel, providerById, type ProviderId } from './providers';
import { describeCompatibleError, streamCompatible } from './openaiCompatible';
import type { GenerateRequest, GenerateResult, StreamHandlers } from './types';

// The Anthropic SDK is only downloaded when someone actually uses a Claude model.
const loadClaude = () => import('./anthropic');
export const preloadClaude = () => void loadClaude();

/** Sends one request to the chosen provider and streams the reply into the handlers. */
export async function generate(providerId: ProviderId, req: GenerateRequest, on: StreamHandlers): Promise<GenerateResult> {
  if (providerId === 'anthropic') {
    const { streamClaude } = await loadClaude();
    return streamClaude(req, on);
  }
  return streamCompatible(providerById(providerId), req, on);
}

export async function describeError(providerId: ProviderId, err: unknown, model: string): Promise<string> {
  if (providerId === 'anthropic') {
    try {
      const { describeClaudeError } = await loadClaude();
      const message = describeClaudeError(err, claudeLabel(model));
      if (message) return message;
    } catch {
      return "Couldn't load the Claude client. Check your connection and reload the page.";
    }
  }
  return describeCompatibleError(err, providerById(providerId), model);
}
