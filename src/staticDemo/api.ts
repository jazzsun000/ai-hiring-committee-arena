import type { Assessment, Health, Question, ScorecardData, Source } from '../api';
import type { BruinResult } from '../components/BruinPanel';
import {
  STATIC_HEALTH, SNAPSHOT_LABEL, startSession, submitAnswer, nextQuestion, buildScorecard, runAnalytics,
} from './engine';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function wrap<T>(ms: number, fn: () => T): Promise<T> {
  await sleep(ms);
  return fn();
}

/** Same shape as the live `/api` client, running entirely in the browser. */
export const staticApi = {
  health: () => Promise.resolve({ ...STATIC_HEALTH } as Health),
  start: (company: string, role: string) => wrap(350, () => {
    const r = startSession(company, role);
    return { ...r, context: { ...r.context, error: r.context.error, snapshot: SNAPSHOT_LABEL } };
  }) as Promise<{ session_id: string; mode: string; question: Question; context: { ok: boolean; sources: Source[]; error: string | null } }>,
  answer: (session_id: string, answer: string) =>
    wrap(800, () => submitAnswer(session_id, answer)) as Promise<{ round: number; assessments: Assessment[] }>,
  next: (session_id: string) =>
    wrap(500, () => nextQuestion(session_id)) as Promise<{ question: Question }>,
  scorecard: (session_id: string) =>
    wrap(400, () => buildScorecard(session_id)) as Promise<ScorecardData>,
  analytics: (session_id: string) =>
    wrap(200, () => runAnalytics(session_id)) as Promise<BruinResult>,
  event: (_e: Record<string, unknown>) => Promise.resolve(undefined),
};
