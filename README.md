# Neural Synthesizer

Describe an interface in plain English. The model you choose (Claude, GPT, Gemini, Grok, DeepSeek,
Mistral, anything on Groq or OpenRouter) writes it as a single React + Tailwind component, and it runs
live in the page. Ask for changes until it's right, then copy the code.

**Live:** https://neural-synthesizer.vercel.app

## Bring your own key

There is no server. The page calls the provider's API straight from your browser with your own key,
so each generation is billed to your account with that provider (usually a few US cents).

| Provider | Models |
| --- | --- |
| Anthropic | Claude Opus 5.5 (default), Sonnet 5.5, Haiku 5.5, Fable 5.2 |
| OpenAI, Google, xAI, DeepSeek, Mistral, Groq, OpenRouter | read live from the provider with your key (OpenRouter's list is public) |

- A key is only ever sent to its own provider. It stays in the browser tab; tick "Remember my keys in
  this browser" to keep them in local storage instead, and untick it to delete them all.
- The page's Content Security Policy only allows network requests to the providers' API hosts.
- Generated code runs in a sandboxed iframe (`public/preview.html`) with an opaque origin, so it
  can't read the page, its storage or the key, and it can't make network requests.

## How it works

| Part | File |
| --- | --- |
| Claude: Anthropic SDK, adaptive thinking with summaries in the log, server-side refusal fallback | `src/lib/anthropic.ts` |
| Every other provider: OpenAI-compatible streaming with plain `fetch` | `src/lib/openaiCompatible.ts` |
| Providers, Claude models and prices, live model lists | `src/lib/providers.ts` |
| System prompt, the "change this component" turn and "Improve my prompt" | `src/lib/prompt.ts` |
| Prompt library | `src/lib/presets.ts` |
| Pulling the code out of the reply and compiling TSX in the browser with Sucrase | `src/lib/code.ts` |
| Sandboxed preview that runs the component with React 18 and Tailwind v4 | `public/preview.html`, `src/components/Preview.tsx` |
| Interface | `src/App.tsx` |

## Run it locally

```bash
npm install
npm run dev
```

Built with React 18, Vite, Tailwind CSS v4, Sucrase and the Anthropic TypeScript SDK.
