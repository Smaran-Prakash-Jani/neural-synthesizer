export type StreamHandlers = {
  /** A piece of the model's reasoning, when the provider shares it. */
  onThinking: (delta: string) => void;
  /** A piece of the reply. */
  onText: (delta: string) => void;
  /** Anthropic only: a declined request was handed to another model, which carries on. */
  onFallback?: (toModel: string) => void;
};

export type GenerateRequest = {
  key: string;
  model: string;
  system: string;
  user: string;
  /** 'brief' for quick jobs (improving a prompt), 'build' for writing components. */
  job: 'build' | 'brief';
  signal: AbortSignal;
};

export type GenerateResult = {
  text: string;
  /** end = finished, length = cut off by the output limit, refusal = declined */
  stop: 'end' | 'length' | 'refusal';
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** US$, only where the price is known */
  cost?: number;
};
