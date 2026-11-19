import { useEffect, useMemo, useRef, type ReactNode } from 'react';

// A small highlighter: comments, strings, JSX tags, keywords and numbers. Good enough to read,
// and it never uses innerHTML.
const TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^\\`])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(<\/?[A-Za-z][\w.]*)|\b(import|from|export|default|function|return|const|let|var|if|else|for|while|switch|case|break|new|type|interface|extends|as|async|await|true|false|null|undefined|typeof|of|in)\b|\b(\d+(?:\.\d+)?)\b/g;

const STYLE = ['text-white/35 italic', 'text-emerald-300/90', 'text-sky-300', 'text-[#c4b5fd]', 'text-amber-200/90'];

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of code.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(code.slice(last, at));
    const group = m.slice(1).findIndex((g) => g !== undefined);
    out.push(
      <span key={i++} className={STYLE[group]}>
        {m[0]}
      </span>,
    );
    last = at + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodeView({ code, streaming }: { code: string; streaming: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const nodes = useMemo(() => highlight(code), [code]);
  const lines = useMemo(() => code.split('\n').length, [code]);

  // follow the code as it streams in
  useEffect(() => {
    if (streaming && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [code, streaming]);

  return (
    <div ref={box} className="h-full overflow-auto bg-[#060608] font-mono text-[12.5px] leading-[1.7]">
      <div className="flex min-w-max">
        <div aria-hidden="true" className="sticky left-0 select-none border-r border-white/[0.06] bg-[#060608] px-4 py-5 text-right text-white/20">
          {Array.from({ length: lines }, (_, n) => (
            <div key={n}>{n + 1}</div>
          ))}
        </div>
        <pre className="px-5 py-5 text-white/80">
          <code>
            {nodes}
            {streaming && <span className="ml-0.5 inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] animate-pulse bg-[#a78bfa]" />}
          </code>
        </pre>
      </div>
    </div>
  );
}
