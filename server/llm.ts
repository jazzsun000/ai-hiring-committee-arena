// Server-side only. The key is never sent to the client and never logged.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
const BASE = () => readDotEnv().XAI_BASE_URL || process.env.XAI_BASE_URL || 'https://api.x.ai/v1';
export const model = () => readDotEnv().XAI_MODEL || process.env.XAI_MODEL || 'grok-4-fast-non-reasoning';
const CACHE_MS = 30_000;

export const state = { mode: 'demo' as 'live' | 'demo', reason: 'not checked yet', lastError: '', keySource: 'none' as 'server/.env' | 'process.env' | 'none' };
let checked = { fp: '', at: 0 };

/** Re-read gitignored server/.env on every call so a new key can be dropped in without restart. */
function readDotEnv(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    return out;
  } catch { return {}; }
}

/**
 * Key resolved at request time. server/.env wins when it has a non-empty XAI_API_KEY, because a running
 * process cannot see a changed process.env; otherwise process.env.XAI_API_KEY is used.
 */
function getKey(): string {
  if (process.env.FORCE_DEMO === '1') { state.keySource = 'none'; return ''; }
  const fileKey = readDotEnv().XAI_API_KEY?.trim();
  if (fileKey && !fileKey.startsWith('your-')) { state.keySource = 'server/.env'; return fileKey; }
  const envKey = process.env.XAI_API_KEY?.trim() || '';
  state.keySource = envKey ? 'process.env' : 'none';
  return envKey;
}
const fingerprint = (k: string) => (k ? crypto.createHash('sha256').update(k).digest('hex').slice(0, 12) : 'none');

/** Validate the current key; cached ≤30s, re-validated immediately when the key changes. */
export async function ensureMode(force = false): Promise<void> {
  const key = getKey();
  const fp = fingerprint(key) + model() + BASE();
  if (!force && fp === checked.fp && Date.now() - checked.at < CACHE_MS) return;
  checked = { fp, at: Date.now() };
  if (!key) {
    state.mode = 'demo';
    state.reason = process.env.FORCE_DEMO === '1' ? 'FORCE_DEMO=1' : 'XAI_API_KEY not set';
    return;
  }
  try {
    await chatJSON('Reply with strict JSON only.', 'Return {"ok": true}', 20, key);
    state.mode = 'live';
    state.reason = `xAI ${model()} reachable (key from ${state.keySource})`;
    state.lastError = '';
  } catch (e) {
    state.mode = 'demo';
    { const m = (e as Error).message; state.reason = /^HTTP 40[013]/.test(m) ? `xAI rejected the API key (${m.slice(0, 8)}); deterministic scorer in use` : `xAI call failed (${m.slice(0, 60)}); deterministic scorer in use`; }
  }
}

export function extractJSON(raw: string): unknown {
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch { /* repair below */ }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    s = s.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(s);
  }
  throw new Error('no JSON object in model output');
}

export async function chatJSON(system: string, user: string, maxTokens = 400, key = getKey()): Promise<unknown> {
  if (!key) throw new Error('no key');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${BASE()}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: model(),
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).replaceAll(key, '[redacted]');
      throw new Error(`HTTP ${res.status} ${body.slice(0, 160)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return extractJSON(data.choices?.[0]?.message?.content ?? '');
  } finally {
    clearTimeout(t);
  }
}

/** Call the model only when live; otherwise / on failure return null so the caller falls back to the deterministic scorer. */
export async function tryLLM(system: string, user: string, maxTokens?: number): Promise<unknown | null> {
  await ensureMode();
  if (state.mode !== 'live') return null;
  try {
    return await chatJSON(system, user, maxTokens);
  } catch (e) {
    state.lastError = (e as Error).message;
    return null;
  }
}
