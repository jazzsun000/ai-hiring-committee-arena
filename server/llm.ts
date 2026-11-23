// Pluggable LLM provider. Server-side only: keys are never sent to the client and never logged.
// LLM_PROVIDER: 'demo' (default, no LLM calls) | 'runware' (OpenAI-compatible chat completions).
// xAI was removed on purpose (product decision): no xAI calls are made even if an XAI key exists.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
const RUNWARE_DEFAULT_BASE = 'https://api.runware.ai/v1';
const CACHE_MS = 30_000;

/** Re-read gitignored server/.env on every call so keys/provider can change without a restart. */
export function readDotEnv(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    return out;
  } catch { return {}; }
}
/** server/.env wins over process.env (a running process can't see a changed environment). */
export const cfg = (name: string): string => (readDotEnv()[name]?.trim() || process.env[name]?.trim() || '');

interface Provider { name: 'demo' | 'runware'; key: string; model: string; base: string; testOverride: boolean }
function provider(): Provider {
  const p = (cfg('LLM_PROVIDER') || 'demo').toLowerCase();
  if (p === 'runware') {
    const base = cfg('RUNWARE_BASE_URL') || RUNWARE_DEFAULT_BASE; // RUNWARE_BASE_URL: tests only (mock server)
    return { name: 'runware', key: cfg('RUNWARE_API_KEY'), model: cfg('RUNWARE_MODEL') || 'minimax:m3@0', base, testOverride: base !== RUNWARE_DEFAULT_BASE };
  }
  return { name: 'demo', key: '', model: '', base: '', testOverride: false };
}

export const state = {
  /** 'live' only after a REAL (non-override) provider call succeeded with the current config. */
  mode: 'demo' as 'live' | 'demo',
  /** true when LLM calls are being attempted (incl. a test override endpoint). */
  llmActive: false,
  provider: 'demo' as 'demo' | 'runware',
  model: null as string | null,
  endpoint: 'none' as 'none' | 'runware' | 'test-override',
  reason: 'LLM_PROVIDER unset (demo)',
  lastRealSuccessAt: null as string | null,
  lastError: '',
};
let checked = { fp: '', at: 0 };

/** Validate the current provider config; cached ≤30s, re-validated immediately when config changes. */
export async function ensureMode(force = false): Promise<void> {
  const p = provider();
  const fp = crypto.createHash('sha256').update([p.name, p.key, p.model, p.base].join('|')).digest('hex');
  if (!force && fp === checked.fp && Date.now() - checked.at < CACHE_MS) return;
  if (fp !== checked.fp) state.lastRealSuccessAt = null; // new config must re-earn LIVE
  checked = { fp, at: Date.now() };
  state.provider = p.name;
  state.model = p.name === 'demo' ? null : p.model;
  state.endpoint = p.name === 'demo' ? 'none' : p.testOverride ? 'test-override' : 'runware';
  if (p.name === 'demo') { Object.assign(state, { mode: 'demo', llmActive: false, reason: 'LLM_PROVIDER unset or demo' }); return; }
  if (!p.key) { Object.assign(state, { mode: 'demo', llmActive: false, reason: 'LLM_PROVIDER=runware but RUNWARE_API_KEY is empty' }); return; }
  try {
    await chatJSON('Reply with strict JSON only.', 'Return {"ok": true}', 20, p);
    state.llmActive = true;
    if (p.testOverride) { state.mode = 'demo'; state.reason = 'runware via TEST override endpoint (not a real call; badge stays DEMO)'; }
    else { state.mode = 'live'; state.lastRealSuccessAt = new Date().toISOString(); state.reason = `Runware ${p.model} verified by a real call`; }
  } catch (e) {
    const m = (e as Error).message;
    Object.assign(state, { mode: 'demo', llmActive: false, reason: `Runware call failed; deterministic scorer in use`, lastError: m.slice(0, 200) });
    console.warn('[llm] provider check failed:', m.slice(0, 200));
  }
}

export function extractJSON(raw: string): unknown {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch { /* repair below */ }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    s = s.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(s);
  }
  throw new Error('no JSON object in model output');
}

async function chatJSON(system: string, user: string, maxTokens = 400, p = provider()): Promise<unknown> {
  if (p.name === 'demo' || !p.key) throw new Error('no provider');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${p.base}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model,
        temperature: 0.3,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).replaceAll(p.key, '[redacted]');
      throw new Error(`HTTP ${res.status} ${body.slice(0, 160)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const out = extractJSON(data.choices?.[0]?.message?.content ?? '');
    if (!p.testOverride) state.lastRealSuccessAt = new Date().toISOString();
    return out;
  } finally {
    clearTimeout(t);
  }
}

/** Call the provider only when active; otherwise / on failure return null so the step falls back to the deterministic scorer. */
export async function tryLLM(system: string, user: string, maxTokens?: number): Promise<unknown | null> {
  await ensureMode();
  if (!state.llmActive) return null;
  try {
    return await chatJSON(system, user, maxTokens);
  } catch (e) {
    state.lastError = (e as Error).message.slice(0, 200);
    console.warn('[llm] step failed, falling back to deterministic:', state.lastError);
    return null;
  }
}
