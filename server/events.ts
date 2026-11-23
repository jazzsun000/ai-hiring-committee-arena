import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// DATA_DIR makes the event log location configurable for hosts with a read-only app dir.
const DATA_DIR = process.env.DATA_DIR?.trim() || path.join(root, 'analytics', 'data');
export let EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
/** Human-readable location (relative to the repo when possible) for /api/health. */
export const eventsFileLabel = () => (EVENTS_FILE.startsWith(root + path.sep) ? path.relative(root, EVENTS_FILE) : EVENTS_FILE);

export type EventType = 'question' | 'answer' | 'assessment' | 'decision' | 'scorecard';
export interface ArenaEvent {
  session_id: string;
  ts: string;
  round: number;
  type: EventType;
  agent: string;
  topic: string | null;
  difficulty: string | null;
  score: number | null;
  reason: string | null;
  text: string | null;
}
const TYPES: EventType[] = ['question', 'answer', 'assessment', 'decision', 'scorecard'];

export function normalizeEvent(e: Partial<ArenaEvent>): ArenaEvent {
  if (!e.session_id || typeof e.session_id !== 'string') throw new Error('session_id required');
  if (!e.type || !TYPES.includes(e.type)) throw new Error(`type must be one of ${TYPES.join('|')}`);
  const agent = e.agent ? String(e.agent) : 'system';
  if (!['maya', 'alex', 'jordan', 'candidate', 'system'].includes(agent)) throw new Error('agent must be maya|alex|jordan|candidate|system');
  if (e.type === 'decision' && !['maya', 'alex', 'jordan'].includes(agent)) throw new Error('decision events must come from maya|alex|jordan');
  return {
    session_id: e.session_id,
    ts: e.ts || new Date().toISOString(),
    round: Number.isFinite(Number(e.round)) ? Number(e.round) : 0,
    type: e.type,
    agent,
    topic: e.topic ?? null,
    difficulty: e.difficulty ?? null,
    score: e.score == null || !Number.isFinite(Number(e.score)) ? null : Number(e.score),
    reason: e.reason ?? null,
    text: e.text ?? null,
  };
}

export function appendEvent(e: Partial<ArenaEvent>): ArenaEvent {
  const ev = normalizeEvent(e);
  const line = JSON.stringify(ev) + '\n';
  try {
    fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
    fs.appendFileSync(EVENTS_FILE, line);
  } catch (err) {
    // Read-only app directory (e.g. a container running as nobody): fall back to the OS temp dir once.
    const fallback = path.join(os.tmpdir(), 'arena-data', 'events.jsonl');
    if (EVENTS_FILE === fallback) throw err;
    console.warn(`[events] ${EVENTS_FILE} not writable (${(err as Error).message}); using ${fallback}`);
    EVENTS_FILE = fallback;
    fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
    fs.appendFileSync(EVENTS_FILE, line);
  }
  return ev;
}
