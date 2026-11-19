// Browser storage can be missing or blocked (private windows, strict settings), so every access
// is guarded and the app works the same without it. Keys are only written when the visitor ticks
// "Remember"; unticking deletes every saved key.
import { PROVIDERS, type ProviderId } from './providers';

const PREFIX = 'neural-synth.';
const keyName = (id: ProviderId) => `${PREFIX}key.${id}`;

function get(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}
function set(name: string, value: string) {
  try {
    localStorage.setItem(name, value);
  } catch {
    /* not available */
  }
}
function remove(name: string) {
  try {
    localStorage.removeItem(name);
  } catch {
    /* not available */
  }
}

export function loadKeys(): Partial<Record<ProviderId, string>> {
  const keys: Partial<Record<ProviderId, string>> = {};
  for (const p of PROVIDERS) {
    const k = get(keyName(p.id));
    if (k) keys[p.id] = k;
  }
  return keys;
}

export function persistKeys(keys: Partial<Record<ProviderId, string>>, remember: boolean) {
  for (const p of PROVIDERS) {
    const k = keys[p.id]?.trim();
    if (remember && k) set(keyName(p.id), k);
    else remove(keyName(p.id));
  }
}

/** Non-secret preferences: the last provider and the model picked for each. */
export function loadPrefs(): { provider?: ProviderId; models: Partial<Record<ProviderId, string>> } {
  try {
    return JSON.parse(get(`${PREFIX}prefs`) || '') as { provider?: ProviderId; models: Partial<Record<ProviderId, string>> };
  } catch {
    return { models: {} };
  }
}

export function savePrefs(prefs: { provider: ProviderId; models: Partial<Record<ProviderId, string>> }) {
  set(`${PREFIX}prefs`, JSON.stringify(prefs));
}
