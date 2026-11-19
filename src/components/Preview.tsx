import { useEffect, useRef } from 'react';

type Props = {
  /** Compiled JavaScript of the component to show. */
  js: string;
  onError: (message: string) => void;
  onRendered: () => void;
  className?: string;
};

/**
 * The live preview. The generated code runs in public/preview.html inside a sandbox with no
 * same-origin access, so it can't touch this page, its storage or the visitor's key. Code goes
 * in by postMessage, and errors come back the same way.
 */
export function Preview({ js, onError, onRendered, className }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const latest = useRef(js);
  const handlers = useRef({ onError, onRendered });
  latest.current = js;
  handlers.current = { onError, onRendered };

  const post = (code: string) => frame.current?.contentWindow?.postMessage({ type: 'render', js: code }, '*');

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const data = event.data as { type?: string; message?: string } | null;
      if (data?.type === 'preview-ready') {
        // also fires again if a form inside the preview reloads it
        ready.current = true;
        if (latest.current) post(latest.current);
      } else if (data?.type === 'preview-error') {
        handlers.current.onError(String(data.message ?? 'Unknown error'));
      } else if (data?.type === 'preview-rendered') {
        handlers.current.onRendered();
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (ready.current && js) post(js);
  }, [js]);

  return (
    <iframe
      ref={frame}
      src="/preview.html"
      title="Live preview of the generated component"
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
      className={className}
    />
  );
}
