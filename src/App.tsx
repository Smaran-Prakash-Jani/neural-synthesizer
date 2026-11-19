import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Preview } from './components/Preview';
import { CodeView } from './components/CodeView';
import { Logo } from './components/Logo';
import { compile, extractCode } from './lib/code';
import { changeRequest, IMPROVE_PROMPT, SYSTEM_PROMPT } from './lib/prompt';
import { PRESETS } from './lib/presets';
import { describeError, generate, preloadClaude } from './lib/generate';
import { CLAUDE_MODELS, DEFAULT_CLAUDE, listModels, modelLabel, PROVIDERS, providerById, type ModelOption, type ProviderId } from './lib/providers';
import { loadKeys, loadPrefs, persistKeys, savePrefs } from './lib/storage';
import type { GenerateResult } from './lib/types';

// The example shown on first load, once a real one has been generated into src/example.json.
// Until then the preview starts empty.
const examples = import.meta.glob<{ default: { prompt: string; model: string; code: string } }>('./example.json', { eager: true });
const EXAMPLE = Object.values(examples)[0]?.default ?? null;

const PORTFOLIO = 'https://portfoliosmaran.vercel.app/#projects';
const SOURCE = 'https://github.com/Smaran-Prakash-Jani/neural-synthesizer';

type Phase = 'idle' | 'thinking' | 'writing' | 'done' | 'error';
type Component = { code: string; prompt: string; example: boolean; model: string };
type ModelList = { status: 'idle' | 'loading' | 'ready' | 'error'; options: ModelOption[]; error?: string };

const initialPrefs = loadPrefs();
const initialKeys = loadKeys();

export default function App() {
  // which model, and whose key
  const [provider, setProvider] = useState<ProviderId>(initialPrefs.provider && PROVIDERS.some((p) => p.id === initialPrefs.provider) ? initialPrefs.provider : 'anthropic');
  const [models, setModels] = useState<Partial<Record<ProviderId, string>>>(initialPrefs.models ?? {});
  const [keys, setKeys] = useState(initialKeys);
  const [remember, setRemember] = useState(Object.keys(initialKeys).length > 0);
  const [showKey, setShowKey] = useState(false);
  const [lists, setLists] = useState<Partial<Record<ProviderId, ModelList>>>({});

  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [improving, setImproving] = useState(false);
  const [reply, setReply] = useState('');
  const [thinking, setThinking] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [usage, setUsage] = useState<GenerateResult | null>(null);

  const [component, setComponent] = useState<Component | null>(EXAMPLE && { code: EXAMPLE.code, prompt: EXAMPLE.prompt, example: true, model: EXAMPLE.model });
  const [js, setJs] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [frame, setFrame] = useState<'full' | 'phone'>('full');
  const [copied, setCopied] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const meta = providerById(provider);
  const key = (keys[provider] ?? '').trim();
  const model = provider === 'anthropic' ? models.anthropic ?? DEFAULT_CLAUDE : models[provider] ?? '';
  const modelName = modelLabel(model);
  const list = lists[provider];
  const busy = phase === 'thinking' || phase === 'writing';
  const working = busy || improving;
  const ready = key !== '' && model !== '';
  const keyLooksWrong = key !== '' && !!meta.keyPrefix && !key.startsWith(meta.keyPrefix);

  // keys are only kept if asked to; preferences (provider and model) always are
  useEffect(() => persistKeys(keys, remember), [keys, remember]);
  useEffect(() => savePrefs({ provider, models }), [provider, models]);
  useEffect(() => {
    if (provider !== 'anthropic') return;
    const t = window.setTimeout(preloadClaude, 1200);
    return () => window.clearTimeout(t);
  }, [provider]);

  // fetch the live model list for the other providers once there's a key (OpenRouter's is public)
  useEffect(() => {
    if (provider === 'anthropic' || (!key && !meta.publicModels)) return;
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      setLists((l) => ({ ...l, [provider]: { status: 'loading', options: l[provider]?.options ?? [] } }));
      listModels(meta, key, controller.signal).then(
        (options) => {
          setLists((l) => ({ ...l, [provider]: { status: 'ready', options } }));
          setModels((m) => (m[provider] && options.some((o) => o.id === m[provider]) ? m : { ...m, [provider]: options[0]?.id ?? '' }));
        },
        async (err: unknown) => {
          if (controller.signal.aborted) return;
          const message = await describeError(provider, err, '');
          setLists((l) => ({ ...l, [provider]: { status: 'error', options: [], error: message } }));
        },
      );
    }, 500);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [provider, key, meta]);

  // compile whatever component is current
  const currentCode = component?.code ?? '';
  useEffect(() => {
    let live = true;
    setProblem(null);
    if (!currentCode) {
      setJs('');
      return;
    }
    compile(currentCode).then(
      (out) => live && setJs(out),
      (err: unknown) => live && setProblem(`The code doesn't compile: ${err instanceof Error ? err.message : String(err)}`),
    );
    return () => {
      live = false;
    };
  }, [currentCode]);

  const shownCode = busy ? extractCode(reply) : currentCode;

  function batcher(apply: (text: string) => void) {
    let buffer = '';
    let frameId = 0;
    const flush = () => {
      frameId = 0;
      apply(buffer);
    };
    return {
      add(d: string) {
        buffer += d;
        if (!frameId) frameId = requestAnimationFrame(flush);
      },
      done() {
        cancelAnimationFrame(frameId);
        flush();
        return buffer;
      },
    };
  }

  async function run(mode: 'new' | 'change', text = prompt.trim()) {
    if (!text || !ready || working || (mode === 'change' && !component)) return;
    const controller = new AbortController();
    abort.current = controller;
    setPhase('thinking');
    setReply('');
    setThinking('');
    setError(null);
    setNotice(null);
    setUsage(null);
    setTab('code');

    const out = batcher(setReply);
    const thought = batcher(setThinking);
    try {
      const result = await generate(
        provider,
        { key, model, system: SYSTEM_PROMPT, user: mode === 'change' ? changeRequest(currentCode, text) : text, job: 'build', signal: controller.signal },
        {
          onThinking: thought.add,
          onText: (d) => {
            setPhase('writing');
            out.add(d);
          },
          onFallback: (to) => setNotice(`${modelName} handed this request to ${to}, which finished it.`),
        },
      );
      const replyText = out.done();
      thought.done();
      if (result.stop === 'refusal') {
        setPhase('error');
        setError('The model declined this request. Try describing the interface differently.');
        setTab('preview');
        return;
      }
      const code = extractCode(replyText);
      if (!code) {
        setPhase('error');
        setError('The model replied without any code. Try again.');
        setTab('preview');
        return;
      }
      if (result.stop === 'length') setNotice('The reply hit the output limit, so the code may be cut off.');
      setComponent({ code, prompt: text, example: false, model: result.model });
      setUsage(result);
      setPhase('done');
      setTab('preview');
      if (mode === 'change') setPrompt('');
    } catch (err) {
      out.done();
      thought.done();
      setPhase('error');
      setError(await describeError(provider, err, model));
      setTab('preview');
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  }

  /** Rewrites the idea in the prompt box into a detailed brief, streamed back into the box. */
  async function improve() {
    const idea = prompt.trim();
    if (!idea || !ready || working) return;
    const controller = new AbortController();
    abort.current = controller;
    setImproving(true);
    setError(null);
    setNotice(null);
    const out = batcher(setPrompt);
    try {
      const result = await generate(provider, { key, model, system: IMPROVE_PROMPT, user: idea, job: 'brief', signal: controller.signal }, { onThinking: () => {}, onText: out.add });
      const brief = out.done().trim();
      if (!brief || result.stop === 'refusal') {
        setPrompt(idea);
        setError("The model couldn't improve that prompt. Your text is back as it was.");
      } else {
        setPrompt(brief.replace(/^["“]|["”]$/g, ''));
      }
    } catch (err) {
      out.done();
      setPrompt(idea);
      setError(await describeError(provider, err, model));
    } finally {
      setImproving(false);
      if (abort.current === controller) abort.current = null;
    }
  }

  function copy() {
    if (!component) return;
    navigator.clipboard?.writeText(component.code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  function download() {
    if (!component) return;
    const url = URL.createObjectURL(new Blob([component.code], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'App.tsx';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const thinkingTail = useMemo(() => thinking.trim().split('\n').filter(Boolean).slice(-4).join('\n'), [thinking]);
  const claude = CLAUDE_MODELS.find((m) => m.id === model);
  const groups = useMemo(() => {
    const out = new Map<string, ModelOption[]>();
    for (const o of list?.options ?? []) out.set(o.group ?? '', [...(out.get(o.group ?? '') ?? []), o]);
    return [...out.entries()];
  }, [list]);

  return (
    <div className="min-h-screen bg-ink text-white" data-phase={phase}>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_30rem_at_80%_-10%,rgba(139,92,246,0.12),transparent_70%)]" />

      <header className="relative z-10 mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <a href={PORTFOLIO} className="group flex items-center gap-3">
          <Logo className="h-8 w-8" />
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/80 group-hover:text-white">Neural Synthesizer</span>
        </a>
        <nav className="flex items-center gap-5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/55">
          <a href={PORTFOLIO} className="hidden hover:text-white sm:inline">Portfolio ↗</a>
          <a href={SOURCE} target="_blank" rel="noopener noreferrer" className="hover:text-white">Source ↗</a>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-[90rem] px-4 pb-16 sm:px-8">
        {/* Intro + demo video */}
        <section className="grid items-end gap-8 border-b border-white/[0.06] pb-10 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16 lg:pb-14 lg:pt-12">
          <div>
            <Label>01 // AI / Product · Bring your own key</Label>
            <h1 className="mt-5 text-5xl font-medium leading-[0.95] tracking-tighter sm:text-7xl">
              Describe it.
              <br />
              <span className="text-white/45">Watch it build.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg font-light leading-relaxed text-white/65">
              Type the interface you want in plain English. Claude, GPT, Gemini, Grok or any model you have a key for writes it as a
              React + Tailwind component, and it runs live right here. Ask for changes until it's right, then copy the code.
            </p>
          </div>
          <HowItWorks />
        </section>

        {/* Workspace */}
        <section className="mt-8 grid gap-6 lg:mt-10 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:gap-8">
          <div className="flex flex-col gap-6">
            <Panel title="01 // Model & key">
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">Provider</p>
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Provider">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    role="radio"
                    aria-checked={provider === p.id}
                    onClick={() => setProvider(p.id)}
                    disabled={working}
                    className={`truncate border px-1 py-2 font-mono text-[9px] uppercase tracking-[0.04em] transition-colors disabled:opacity-50 ${provider === p.id ? 'border-lilac/70 bg-violet/15 text-white' : 'border-white/[0.08] text-white/55 hover:border-white/25 hover:text-white'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <label htmlFor="model" className="mb-2 mt-4 block font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">Model</label>
              {provider === 'anthropic' ? (
                <>
                  <Select id="model" value={model} disabled={working} onChange={(v) => setModels((m) => ({ ...m, anthropic: v }))}>
                    {CLAUDE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </Select>
                  {claude && <p className="mt-1.5 text-[11px] text-white/45">{claude.note}</p>}
                </>
              ) : list?.status === 'error' || (list?.status === 'ready' && list.options.length === 0) ? (
                <>
                  <input
                    id="model"
                    value={model}
                    onChange={(e) => setModels((m) => ({ ...m, [provider]: e.target.value }))}
                    placeholder="Type a model ID"
                    spellCheck={false}
                    className="w-full border border-white/10 bg-black/40 px-3 py-2 font-mono text-[13px] text-white placeholder:text-white/25 focus:border-lilac/70 focus:outline-none"
                  />
                  <p className="mt-1.5 text-[11px] text-amber-200/80">{list?.error ? `Couldn't load the model list: ${list.error}` : 'No models came back for this key.'}</p>
                </>
              ) : list?.status === 'ready' ? (
                <>
                  <Select id="model" value={model} disabled={working} onChange={(v) => setModels((m) => ({ ...m, [provider]: v }))}>
                    {groups.map(([group, options]) =>
                      group ? (
                        <optgroup key={group} label={group}>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </optgroup>
                      ) : (
                        options.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))
                      ),
                    )}
                  </Select>
                  <p className="mt-1.5 text-[11px] text-white/45">{list.options.length} models from {meta.name}, newest first. Bigger models write better components.</p>
                </>
              ) : (
                <p className="border border-dashed border-white/10 px-3 py-2.5 text-[12px] text-white/45">
                  {list?.status === 'loading' ? `Loading ${meta.name} models...` : `Paste your ${meta.name} key below to load its models.`}
                </p>
              )}

              <label htmlFor="key" className="mb-2 mt-4 block font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">{meta.name} API key</label>
              <div className="flex items-stretch border border-white/10 bg-black/40 focus-within:border-lilac/70">
                <input
                  id="key"
                  type={showKey ? 'text' : 'password'}
                  value={keys[provider] ?? ''}
                  onChange={(e) => setKeys((k) => ({ ...k, [provider]: e.target.value }))}
                  placeholder={meta.keyPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm text-white placeholder:text-white/25 focus:outline-none"
                />
                <button type="button" onClick={() => setShowKey((v) => !v)} className="border-l border-white/10 px-3 font-mono text-[10px] uppercase tracking-[0.15em] text-white/55 hover:text-white">
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              {keyLooksWrong && <p className="mt-2 text-xs text-amber-300/90">{meta.name} keys usually start with {meta.keyPrefix}</p>}
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-white/60">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-violet" />
                Remember my keys in this browser
              </label>
              <p className="mt-3 text-xs leading-relaxed text-white/45">
                Your key stays in your browser and is sent only to {meta.host}. Each request is billed to your {meta.name} account.{' '}
                <a href={meta.keysUrl} target="_blank" rel="noopener noreferrer" className="text-mist underline decoration-mist/30 underline-offset-2 hover:decoration-mist">
                  Get a key
                </a>
              </p>
            </Panel>

            <Panel title="02 // Describe the interface">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run('new');
                }}
              >
                <label htmlFor="prompt" className="sr-only">What should the model build?</label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      run('new');
                    }
                  }}
                  readOnly={improving}
                  rows={6}
                  placeholder="A weather card with an hourly forecast and a °C / °F switch..."
                  className={`block w-full resize-y border bg-black/40 px-3 py-2.5 text-sm leading-relaxed text-white placeholder:text-white/25 focus:border-lilac/70 focus:outline-none ${improving ? 'border-lilac/50' : 'border-white/10'}`}
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={improve}
                    disabled={!ready || !prompt.trim() || working}
                    title="Turns a rough idea into a detailed brief"
                    className="group flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-mist hover:text-white disabled:cursor-not-allowed disabled:text-white/30"
                  >
                    <Sparkle className={`h-3.5 w-3.5 ${improving ? 'motion-safe:animate-spin' : ''}`} />
                    {improving ? 'Improving...' : 'Improve my prompt'}
                  </button>
                  <span className="hidden font-mono text-[9px] uppercase tracking-[0.15em] text-white/30 sm:inline">Ctrl / ⌘ + Enter</span>
                </div>

                <p className="mb-2 mt-4 font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">Prompt library</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.title}
                      type="button"
                      onClick={() => setPrompt(p.prompt)}
                      disabled={working}
                      title={p.prompt}
                      className={`border px-2.5 py-1 text-left text-[11px] transition-colors disabled:opacity-50 ${prompt === p.prompt ? 'border-lilac/60 text-white' : 'border-white/[0.08] text-white/55 hover:border-lilac/50 hover:text-white'}`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {working ? (
                    <button type="button" onClick={() => abort.current?.abort()} className="flex-1 border border-white/20 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white hover:border-white/50">
                      Stop
                    </button>
                  ) : (
                    <>
                      <button
                        type="submit"
                        disabled={!ready || !prompt.trim()}
                        className="flex-1 bg-violet px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white transition-colors hover:bg-lilac disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
                      >
                        Synthesize
                      </button>
                      <button
                        type="button"
                        onClick={() => run('change')}
                        disabled={!ready || !prompt.trim() || !component}
                        title="Apply your text as a change to the component on the right"
                        className="border border-lilac/40 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-mist transition-colors hover:border-lilac disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
                      >
                        Change current
                      </button>
                    </>
                  )}
                </div>
                {!key && <p className="mt-3 text-xs text-white/40">Add a key above to start.</p>}
              </form>
            </Panel>

            <Panel title="03 // Synth log">
              <Log phase={phase} improving={improving} thinking={thinkingTail} error={error} notice={notice} usage={usage} provider={meta.name} />
            </Panel>
          </div>

          {/* Output */}
          <div className="flex min-w-0 flex-col border border-white/[0.08] bg-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-3 py-2.5 sm:px-4">
              <div className="flex items-center gap-1" role="tablist" aria-label="Output">
                <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>Preview</TabButton>
                <TabButton active={tab === 'code'} onClick={() => setTab('code')}>Code</TabButton>
              </div>
              <div className="flex items-center gap-3">
                {tab === 'preview' && (
                  <div className="hidden items-center gap-1 sm:flex" aria-label="Preview width">
                    <TabButton active={frame === 'full'} onClick={() => setFrame('full')}>Full</TabButton>
                    <TabButton active={frame === 'phone'} onClick={() => setFrame('phone')}>Phone</TabButton>
                  </div>
                )}
                <button onClick={copy} disabled={busy || !component} className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/55 hover:text-white disabled:opacity-40">
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button onClick={download} disabled={busy || !component} className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/55 hover:text-white disabled:opacity-40">
                  .tsx
                </button>
              </div>
            </div>

            <div className="flex items-start gap-3 border-b border-white/[0.06] px-3 py-2.5 sm:px-4">
              <span className={`mt-[3px] shrink-0 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] ${busy ? 'bg-lilac/20 text-mist' : !component ? 'bg-white/10 text-white/60' : component.example ? 'bg-white/10 text-white/70' : 'bg-emerald-400/15 text-emerald-300'}`}>
                {busy ? 'Streaming' : !component ? 'Ready' : component.example ? 'Example' : 'Yours'}
              </span>
              <p className="line-clamp-2 min-w-0 text-xs leading-relaxed text-white/55" title={component?.prompt}>
                {busy ? (
                  `${modelName} is writing the component...`
                ) : !component ? (
                  'Your component will appear here.'
                ) : (
                  <>
                    “{component.prompt}”<span className="text-white/35"> · {modelLabel(component.model)}</span>
                  </>
                )}
              </p>
            </div>

            <div className="relative h-[70svh] min-h-[30rem] lg:h-[calc(100svh-12rem)] lg:min-h-[36rem]">
              {!component && !busy && tab === 'preview' && <EmptyState />}
              <div className={`absolute inset-0 flex justify-center bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.025)_0_10px,transparent_10px_20px)] ${tab === 'preview' && component ? '' : 'invisible'}`}>
                <Preview
                  js={js}
                  onError={(m) => setProblem(`The component crashed: ${m}`)}
                  onRendered={() => setProblem(null)}
                  className={`h-full border-0 bg-white transition-[width] duration-300 ${frame === 'phone' ? 'w-[390px] max-w-full border-x border-white/10' : 'w-full'}`}
                />
              </div>
              {tab === 'code' && (
                <div className="absolute inset-0">
                  {shownCode || busy ? (
                    <CodeView code={shownCode} streaming={phase === 'writing'} />
                  ) : (
                    <div className="grid h-full place-items-center bg-[#060608] font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">No code yet</div>
                  )}
                  {phase === 'thinking' && (
                    <div className="absolute inset-0 grid place-items-center bg-[#060608]">
                      <Pulse label="Planning the component" />
                    </div>
                  )}
                </div>
              )}
              {problem && component && !busy && tab === 'preview' && (
                <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-3 border border-red-400/30 bg-[#140707]/95 px-4 py-3 text-xs text-red-200 backdrop-blur">
                  <span className="min-w-0 flex-1 break-words">{problem}</span>
                  {ready && !component.example && (
                    <button onClick={() => run('change', `Fix this error and change nothing else: ${problem}`)} className="shrink-0 border border-red-300/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] hover:border-red-200">
                      Ask the model to fix it
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="mt-14 flex flex-col gap-3 border-t border-white/[0.06] pt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <span>Built by Smaran Prakash Jani · React, Tailwind and your choice of model</span>
          <span>No server, no tracking. Generated code runs in a sandboxed frame.</span>
        </footer>
      </main>
    </div>
  );
}

function Select({ id, value, disabled, onChange, children }: { id: string; value: string; disabled?: boolean; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none border border-white/10 bg-black/40 py-2 pl-3 pr-9 text-[13px] text-white focus:border-lilac/70 focus:outline-none disabled:opacity-60 [&_optgroup]:bg-[#0b0b10] [&_option]:bg-[#0b0b10]"
      >
        {children}
      </select>
      <svg aria-hidden="true" viewBox="0 0 12 12" className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-white/50">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={className}>
      <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" fill="currentColor" />
    </svg>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-white/60">
      <span className="h-1 w-1 rounded-full border border-violet/80" />
      {children}
    </p>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="relative border border-white/[0.08] bg-black/30 p-4 sm:p-5">
      <span aria-hidden="true" className="absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-lilac/60" />
      <span aria-hidden="true" className="absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-lilac/60" />
      <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-white/55">{title}</h2>
      {children}
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function Pulse({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="relative flex h-3 w-3">
        <span className="absolute inset-0 animate-ping rounded-full bg-lilac opacity-60" />
        <span className="relative h-3 w-3 rounded-full bg-lilac" />
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-mist/80">{label}</span>
    </div>
  );
}

function Log({ phase, improving, thinking, error, notice, usage, provider }: { phase: Phase; improving: boolean; thinking: string; error: string | null; notice: string | null; usage: GenerateResult | null; provider: string }) {
  const status: Record<Phase, string> = { idle: 'Standing by', thinking: 'Thinking', writing: 'Writing code', done: 'Done', error: 'Stopped' };
  const active = improving || phase === 'thinking' || phase === 'writing';
  return (
    <div className="space-y-3 text-xs leading-relaxed">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">
        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'animate-pulse bg-lilac' : phase === 'error' || error ? 'bg-red-400' : phase === 'done' ? 'bg-emerald-400' : 'bg-white/30'}`} />
        {improving ? 'Improving your prompt' : status[phase]}
      </p>
      {thinking && (phase === 'thinking' || phase === 'writing') && <p className="whitespace-pre-line border-l border-lilac/30 pl-3 text-white/50">{thinking}</p>}
      {notice && <p className="text-amber-200/85">{notice}</p>}
      {error && <p className="text-red-300">{error}</p>}
      {usage && (
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/45">
          {usage.inputTokens !== undefined && usage.outputTokens !== undefined ? `${usage.inputTokens.toLocaleString()} in · ${usage.outputTokens.toLocaleString()} out` : 'Tokens not reported'}
          {usage.cost !== undefined ? ` · ≈ $${usage.cost.toFixed(3)}` : ` · billed by ${provider}`}
          <span className="block normal-case tracking-normal text-white/35">{modelLabel(usage.model)}</span>
        </p>
      )}
      {phase === 'idle' && !improving && !error && <p className="text-white/40">Reasoning notes and token usage show up here while the model works.</p>}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    ['Pick a model', 'Claude, GPT, Gemini, Grok, DeepSeek, Mistral, Groq or anything on OpenRouter. Your key stays in your browser.'],
    ['Describe it', 'In your own words, or start from the prompt library. "Improve my prompt" turns a rough idea into a detailed brief.'],
    ['Watch it build', 'The code streams in and runs live in a sandbox. Ask for changes until it is right, then copy the .tsx.'],
  ];
  return (
    <section aria-label="How it works" className="relative border border-white/[0.08] bg-black/40 p-5 sm:p-6">
      <span aria-hidden="true" className="absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-lilac/60" />
      <span aria-hidden="true" className="absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-lilac/60" />
      <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/55">How it works</h2>
      <ol className="mt-5 space-y-5">
        {steps.map(([title, text], i) => (
          <li key={title} className="flex gap-4">
            <span className="mt-0.5 font-mono text-[10px] tracking-[0.2em] text-mist">0{i + 1}</span>
            <div>
              <p className="text-[15px] font-medium text-white">{title}</p>
              <p className="mt-1 text-sm font-light leading-relaxed text-white/55">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[#060608] px-6">
      <div className="max-w-sm text-center">
        <Logo className="mx-auto h-14 w-14 opacity-90" />
        <p className="mt-6 text-lg font-medium tracking-tight text-white">Nothing synthesized yet</p>
        <p className="mt-2 text-sm font-light leading-relaxed text-white/55">
          Pick a provider and paste your key, describe an interface or choose a brief from the prompt library, then press
          Synthesize. It builds right here.
        </p>
      </div>
    </div>
  );
}
