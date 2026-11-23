export type Scorer = 'maya' | 'alex';
export type Difficulty = 'easy' | 'medium' | 'hard';
export interface Question { round: number; asker: Scorer; topic: string; topicLabel: string; difficulty: Difficulty; text: string; reason: string; trend: 'up' | 'down' | 'flat' | 'start'; source: 'llm' | 'deterministic' }
export interface Assessment { agent: Scorer; score: number; evidence: string; gap: string; source: 'llm' | 'deterministic' }
export interface Health { ok: boolean; mode: 'live' | 'demo'; reason: string; model: string | null }
export interface ScorecardData {
  company: string; role: string; overall: number;
  recommendation: 'strong_hire' | 'hire' | 'lean_hire' | 'lean_no_hire' | 'no_hire';
  summary: string; quotes: string[]; rounds: number; source: string;
  skills: { skill: string; score: number; evidence: string; gap: string; assessedBy: Scorer }[];
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} failed: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => call<Health>('/api/health'),
  start: (company: string, role: string) => call<{ session_id: string; mode: string; question: Question }>('/api/session', { company, role }),
  answer: (session_id: string, answer: string) => call<{ round: number; assessments: Assessment[] }>('/api/answer', { session_id, answer }),
  next: (session_id: string) => call<{ question: Question }>('/api/next', { session_id }),
  scorecard: (session_id: string) => call<ScorecardData>('/api/scorecard', { session_id }),
  analytics: (session_id: string) => call<import('./components/BruinPanel').BruinResult>('/api/analytics/run', { session_id }),
  event: (e: Record<string, unknown>) => call('/api/events', e).catch(() => undefined),
};
