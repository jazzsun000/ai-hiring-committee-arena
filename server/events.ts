import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EVENTS_FILE = path.join(root, 'analytics', 'data', 'events.jsonl');

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
  fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(ev) + '\n');
  return ev;
}
