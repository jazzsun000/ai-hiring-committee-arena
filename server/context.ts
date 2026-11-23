// Optional Telem role-context retrieval. server/telem.ts is owned by the PM helper; it is loaded
// dynamically only if present, so the app builds and runs with or without it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg } from './llm.js';

export interface Source { title: string; url: string; snippet: string }
export interface RoleContext { ok: boolean; sources: Source[]; error?: string; ms: number; provider: 'telem' | 'none' }
const DIR = path.dirname(fileURLToPath(import.meta.url));

export const telemStatus = { available: false, lastOk: null as boolean | null, lastCount: 0, lastError: null as string | null, lastAt: null as string | null };

const isHttp = (u: unknown): u is string => { try { const p = new URL(String(u)).protocol; return p === 'http:' || p === 'https:'; } catch { return false; } };

export function trimWords(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = cut.lastIndexOf(' ');
  return (i > max * 0.5 ? cut.slice(0, i) : cut).replace(/[\s,;:.\-–—]+$/, '') + '…';
}

export async function retrieveContext(company: string, role: string, timeoutMs = 5000): Promise<RoleContext> {
  const started = Date.now();
  const file = ['telem.ts', 'telem.js'].find((f) => fs.existsSync(path.join(DIR, f)));
  telemStatus.available = !!file;
  if (!file) return { ok: false, sources: [], error: 'telem module not present', ms: 0, provider: 'none' };
  try {
    // telem.ts reads process.env.TELEM_API_KEY; hydrate it from server/.env at request time (never logged).
    const key = cfg('TELEM_API_KEY');
    if (key) process.env.TELEM_API_KEY = key;
    const spec = './telem.js';
    const mod = (await import(/* @vite-ignore */ spec)) as { retrieveRoleContext?: (c: string, r: string) => Promise<{ ok: boolean; sources?: unknown[]; error?: string }> };
    if (typeof mod.retrieveRoleContext !== 'function') throw new Error('retrieveRoleContext not exported');
    const res = await Promise.race([
      mod.retrieveRoleContext(company, role),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)),
    ]);
    const sources = (res.sources ?? [])
      .map((s) => s as Partial<Source>)
      .filter((s) => isHttp(s.url) && typeof s.title === 'string')
      .map((s) => ({ title: String(s.title).slice(0, 200), url: String(s.url), snippet: String(s.snippet ?? '').slice(0, 600) }))
      .slice(0, 8);
    Object.assign(telemStatus, { lastOk: !!res.ok && sources.length > 0, lastCount: sources.length, lastError: res.ok ? null : String(res.error ?? 'unknown').slice(0, 160), lastAt: new Date().toISOString() });
    return { ok: !!res.ok && sources.length > 0, sources, error: res.ok ? undefined : res.error, ms: Date.now() - started, provider: 'telem' };
  } catch (e) {
    const m = (e as Error).message.slice(0, 160);
    Object.assign(telemStatus, { lastOk: false, lastCount: 0, lastError: m, lastAt: new Date().toISOString() });
    console.warn('[telem] retrieval failed, continuing without context:', m);
    return { ok: false, sources: [], error: m, ms: Date.now() - started, provider: 'telem' };
  }
}

/** Pick one readable sentence from a (often markdown) snippet for the opening question. */
export function bestSentence(snippet: string, title: string): string {
  const segs = snippet.split(/\n+|#{1,6}\s+|\.{3,}|…/).map((seg) => seg.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>`|]+/g, ' ').replace(/\s+/g, ' ').trim());
  const sents = segs.flatMap((seg) => seg.split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter((x) => x.length >= 40 && x.length <= 260 && /[.!?]$/.test(x));
  const pick = sents.find((x) => /team|partner|experiment|product|data scien|metric|analy/i.test(x)) ?? sents[0];
  return trimWords(pick ?? title, 160);
}

/** One short sentence (≤ ~120 chars) paraphrasing the top source, for the opening bubble. Full snippet stays in SourcesPanel. */
export function openingLead(company: string, top: Source): string {
  let host = '';
  try { host = new URL(top.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  const own = host.includes(company.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const label = own ? `${company}'s listing` : `A ${company} interview guide`;
  let sent = bestSentence(top.snippet, top.title).replace(/…$/, '').replace(/^(about (the|us|our)[^.]*?\s(?=our|we|the)\s*)/i, '').replace(/^our\s+/i, 'the ').replace(/^about\s+(the\s+)?\S+\s+(?=[A-Z])/i, '');
  sent = trimWords(sent.charAt(0).toLowerCase() + sent.slice(1), 120 - label.length - 8).replace(/[.…]+$/, '');
  return `${label} says ${sent}…`;
}
