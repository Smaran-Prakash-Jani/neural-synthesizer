import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The page holds the visitor's API keys, so the built page only runs its own scripts and only talks
 * to the model providers' APIs. Added at build time only, because the dev server injects inline scripts.
 * The live preview is a separate, sandboxed document (public/preview.html) with its own policy.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self'",
  'connect-src https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com https://api.x.ai https://api.deepseek.com https://api.mistral.ai https://api.groq.com https://openrouter.ai',
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
});
