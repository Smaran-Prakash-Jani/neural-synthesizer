/**
 * Pulls the component out of the model's reply. While the reply is still streaming the closing
 * fence may not have arrived yet, so everything after the opening fence counts.
 */
export function extractCode(reply: string): string {
  const open = reply.match(/```[a-zA-Z]*[^\S\n]*\n/);
  if (!open || open.index === undefined) return reply.trim();
  const body = reply.slice(open.index + open[0].length);
  const close = body.search(/\n```/);
  return (close === -1 ? body : body.slice(0, close)).replace(/\s+$/, '');
}

/** Turns the TSX into plain JavaScript the preview can run (CommonJS, classic JSX). */
export async function compile(code: string): Promise<string> {
  const { transform } = await import('sucrase');
  return transform(code, {
    transforms: ['typescript', 'jsx', 'imports'],
    jsxRuntime: 'classic',
    production: true,
  }).code;
}
