/** In-browser port of the server interview engine (deterministic only). Used when VITE_STATIC_DEMO=1. */
import { TOPICS, topicById, type Difficulty } from './bank';
import { scoreDeterministic, nextDifficulty, type Assessment } from './deterministic';
import { snapshot } from './telem-snapshot';
import type { Question, ScorecardData, Source, Health } from '../api';
import type { BruinResult } from '../components/BruinPanel';

type Scorer = 'maya' | 'alex';
interface Round { question: Question; answer?: string; assessments?: Assessment[] }
interface Session { id: string; company: string; role: string; rounds: Round[]; sources: Source[] }

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const RANK: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
const sessions = new Map<string, Session>();

const fill = (t: string, s: Session) => t.replaceAll('{company}', s.company).replaceAll('{role}', s.role);
const trendOf = (prev: Difficulty, next: Difficulty) => {
  const d = DIFFS.indexOf(next) - DIFFS.indexOf(prev);
  return d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
};
const norm = (s: string) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const isVerbatim = (quote: string, answers: string[]) => quote.trim().length >= 8 && answers.some((a) => norm(a).includes(norm(quote)));

export const RECORDED_SOURCES: Source[] = snapshot.sources.map((s) => ({
  title: s.title,
  url: s.url,
  snippet: s.snippet,
}));

export const SNAPSHOT_LABEL = snapshot.label as string;

export const STATIC_HEALTH: Health = {
  ok: true,
  mode: 'demo',
  provider: 'static-demo',
  endpoint: 'in-browser',
  llm_active: false,
  last_real_success_at: null,
  reason: 'Static demo: deterministic scoring, recorded Telem sources. LIVE version runs agents on Runware.',
  model: null,
};

function trimWords(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = cut.lastIndexOf(' ');
  return (i > max * 0.5 ? cut.slice(0, i) : cut).replace(/[\s,;:.\-–—]+$/, '') + '…';
}

function bestSentence(snippet: string, title: string): string {
  const segs = snippet.split(/\n+|#{1,6}\s+|\.{3,}|…/).map((seg) => seg.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>`|]+/g, ' ').replace(/\s+/g, ' ').trim());
  const sents = segs.flatMap((seg) => seg.split(/(?<=[.!?])\s+/)).map((x) => x.trim()).filter((x) => x.length >= 40 && x.length <= 260 && /[.!?]$/.test(x));
  const pick = sents.find((x) => /team|partner|experiment|product|data scien|metric|analy/i.test(x)) ?? sents[0];
  return trimWords(pick ?? title, 160);
}

function openingLead(company: string, top: Source): string {
  let host = '';
  try { host = new URL(top.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  const own = host.includes(company.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const label = own ? `${company}'s listing` : `A ${company} interview guide`;
  let sent = bestSentence(top.snippet, top.title).replace(/…$/, '').replace(/^(about (the|us|our)[^.]*?\s(?=our|we|the)\s*)/i, '').replace(/^our\s+/i, 'the ').replace(/^about\s+(the\s+)?\S+\s+(?=[A-Z])/i, '');
  sent = trimWords(sent.charAt(0).toLowerCase() + sent.slice(1), 120 - label.length - 8).replace(/[.…]+$/, '');
  return `${label} says ${sent}…`;
}

function requireSession(id: string): Session {
  const s = sessions.get(id);
  if (!s) throw new Error('unknown session');
  return s;
}

function deterministicNext(s: Session, last: Round): Question {
  const a = last.assessments ?? [];
  const avg = a.reduce((n, x) => n + x.score, 0) / Math.max(1, a.length);
  const prevQ = last.question;
  let difficulty = nextDifficulty(avg, prevQ.difficulty);
  const used = new Set(s.rounds.map((r) => `${r.question.topic}:${r.question.difficulty}`));
  let asker: Scorer;
  let topic: string;
  let reason: string;
  const gap = a.map((x) => x.gap).find((g) => g.startsWith('Did not address')) ?? a[0]?.gap ?? '';
  if (avg >= 3.5) {
    asker = prevQ.asker === 'maya' ? 'alex' : 'maya';
    const order = asker === 'alex' ? ['causal', 'sql'] : ['ab_testing', 'metrics'];
    topic = order.find((t) => !used.has(`${t}:${difficulty}`)) ?? order[0];
    reason = `Raised difficulty: avg ${avg.toFixed(1)}/5, candidate cited "${trimWords(a[0]?.evidence ?? '', 90)}". Handing to ${asker === 'alex' ? 'Alex' : 'Maya'} for a harder ${topicById(topic).label} question.`;
  } else if (avg < 2.5) {
    asker = prevQ.asker;
    topic = prevQ.topic;
    reason = `${difficulty === prevQ.difficulty ? 'Probing at same difficulty' : 'Lowered difficulty to probe'}: avg ${avg.toFixed(1)}/5. ${gap} ${asker === 'alex' ? 'Alex' : 'Maya'} probes ${topicById(topic).label} basics.`;
  } else {
    asker = prevQ.asker === 'maya' ? 'alex' : 'maya';
    const order = asker === 'alex' ? ['sql', 'causal'] : ['metrics', 'ab_testing'];
    topic = order.find((t) => !used.has(`${t}:${difficulty}`)) ?? order[0];
    reason = `Kept difficulty: avg ${avg.toFixed(1)}/5, solid but incomplete (${gap}) Switching to ${topicById(topic).label} for breadth.`;
  }
  const asked = new Set(s.rounds.map((r) => `${r.question.topic}:${r.question.difficulty}`));
  const fresh = (tp: string, d: Difficulty) => !asked.has(`${tp}:${d}`);
  if (!fresh(topic, difficulty)) {
    const ownTopics = TOPICS.filter((x) => x.owner === asker).map((x) => x.id);
    const topicOrder = [topic, ...ownTopics.filter((x) => x !== topic), ...TOPICS.map((x) => x.id).filter((x) => x !== topic && !ownTopics.includes(x))];
    const di = DIFFS.indexOf(difficulty);
    const alt = topicOrder.flatMap((tp, ti) => DIFFS.map((d) => ({ tp, d, k: [DIFFS.indexOf(d) > di ? 1 : 0, ti, Math.abs(DIFFS.indexOf(d) - di)] })))
      .filter((c) => fresh(c.tp, c.d))
      .sort((x, y) => x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.k[2] - y.k[2])
      .map((c) => [c.tp, c.d] as const)[0];
    if (alt) {
      if (alt[0] !== topic) {
        const newOwner = topicById(alt[0]).owner;
        reason = reason.replace(/(Maya|Alex) probes .*$/, '') + ` ${topicById(topic).label} questions at this level already asked, so ${newOwner === 'alex' ? 'Alex' : 'Maya'} probes ${topicById(alt[0]).label} instead.`;
        asker = newOwner;
      }
      topic = alt[0]; difficulty = alt[1];
    }
  }
  const t = topicById(topic);
  return {
    round: last.question.round + 1, asker, topic, topicLabel: t.label, difficulty,
    text: fill(t.questions[difficulty], s), reason: reason.replace(/\s+/g, ' ').trim(),
    trend: trendOf(prevQ.difficulty, difficulty), source: 'deterministic',
  };
}

function pickQuotes(answers: string[], n: number): string[] {
  const out: string[] = [];
  for (const a of answers) {
    const parts = a.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 4);
    const best = parts.sort((x, y) => y.length - x.length)[0] ?? a.trim();
    if (best && !out.includes(best)) out.push(best.length > 200 ? best.slice(0, 200) : best);
  }
  for (const a of answers) {
    for (const p of a.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean)) {
      if (out.length >= n) break;
      if (!out.includes(p)) out.push(p.slice(0, 200));
    }
  }
  return out.slice(0, Math.max(n, out.length));
}

function recFor(avg: number) {
  return avg >= 4.3 ? 'strong_hire' : avg >= 3.6 ? 'hire' : avg >= 3 ? 'lean_hire' : avg >= 2.2 ? 'lean_no_hire' : 'no_hire';
}

export function startSession(company: string, role: string) {
  const s: Session = {
    id: crypto.randomUUID(),
    company: company.slice(0, 60) || 'Acme',
    role: role.slice(0, 60) || 'Product Data Scientist',
    rounds: [],
    sources: RECORDED_SOURCES,
  };
  sessions.set(s.id, s);
  const t = topicById('metrics');
  const top = s.sources.find((x) => x.snippet.trim().length > 20) ?? s.sources[0];
  const lead = top ? `${openingLead(s.company, top)} ` : '';
  const q: Question = {
    round: 1, asker: 'maya', topic: t.id, topicLabel: t.label, difficulty: 'medium',
    text: lead + fill(t.questions.medium, s),
    reason: top
      ? `Opening: Maya starts with a medium product-metrics question, grounded in a recorded Telem snapshot (${s.sources.length} sources).`
      : 'Opening: Maya starts with a medium product-metrics question to calibrate.',
    trend: 'start', source: 'deterministic',
  };
  s.rounds.push({ question: q });
  return { session_id: s.id, mode: 'demo' as const, question: q, context: { ok: true, sources: s.sources, error: null as string | null } };
}

export function submitAnswer(session_id: string, answer: string) {
  const s = requireSession(session_id);
  const text = answer.trim();
  if (!text) throw new Error('answer required');
  const r = s.rounds[s.rounds.length - 1];
  if (r.answer) throw new Error('round already answered');
  r.answer = text.slice(0, 4000);
  r.assessments = (['maya', 'alex'] as Scorer[]).map((a) => scoreDeterministic(a, r.answer!, r.question.topic));
  return { round: r.question.round, assessments: r.assessments };
}

export function nextQuestion(session_id: string) {
  const s = requireSession(session_id);
  const last = s.rounds[s.rounds.length - 1];
  if (!last.assessments) throw new Error('answer current round first');
  const q = deterministicNext(s, last);
  s.rounds.push({ question: q });
  return { question: q };
}

export function buildScorecard(session_id: string): ScorecardData {
  const s = requireSession(session_id);
  const done = s.rounds.filter((r) => r.answer && r.assessments);
  const answers = done.map((r) => r.answer!);
  const all = done.flatMap((r) => r.assessments!);
  const overall = all.length ? all.reduce((n, a) => n + a.score, 0) / all.length : 0;
  const skills = done.flatMap((r) => r.assessments!.map((a) => ({
    skill: `R${r.question.round} ${r.question.topicLabel} (${r.question.difficulty}) · ${a.agent === 'maya' ? 'Maya' : 'Alex'}`,
    score: a.score, evidence: a.evidence, gap: a.gap, assessedBy: a.agent,
  })));
  const summary = `${done.length} round(s) completed. Average ${overall.toFixed(1)}/5 across ${all.length} independent assessments.`;
  const quotes: string[] = [];
  for (const q of [...done.map((r) => r.assessments![0].evidence).filter((e) => isVerbatim(e, answers)), ...pickQuotes(answers, 2)]) {
    if (quotes.length < 2 && !quotes.includes(q)) quotes.push(q);
  }
  return {
    company: s.company, role: s.role, overall: Math.round(overall * 10) / 10,
    recommendation: done.length ? recFor(overall) : 'no_hire',
    summary, quotes, skills, rounds: done.length, source: 'deterministic',
  };
}

export function runAnalytics(session_id: string): BruinResult {
  const s = requireSession(session_id);
  const started = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const trend = s.rounds.map((r, i) => {
    const assessments = r.assessments;
    const avg = assessments && assessments.length ? assessments.reduce((n, a) => n + a.score, 0) / assessments.length : null;
    const prev = i > 0 ? s.rounds[i - 1] : undefined;
    const prevAvg = prev?.assessments && prev.assessments.length ? prev.assessments.reduce((n, a) => n + a.score, 0) / prev.assessments.length : null;
    const prevDiff = prev?.question.difficulty ?? null;
    const diff = r.question.difficulty;
    const adaptivity = i === 0 || prevAvg == null || !prevDiff
      ? false
      : (prevAvg >= 3.5 && RANK[diff] > RANK[prevDiff])
        || (prevAvg <= 2.5 && RANK[diff] < RANK[prevDiff])
        || (prevAvg > 2.5 && prevAvg < 3.5 && RANK[diff] === RANK[prevDiff]);
    return {
      round: r.question.round,
      avg_score: avg == null ? null : Math.round(avg * 100) / 100,
      difficulty: diff,
      prev_difficulty: prevDiff,
      difficulty_rose: Boolean(prevDiff && RANK[diff] > RANK[prevDiff]),
      adaptivity,
    };
  });
  const transitions = trend.filter((t) => t.round > 1);
  const adaptivity = transitions.length > 0 && (transitions.filter((t) => t.adaptivity).length / transitions.length) >= 0.5;
  const all = s.rounds.flatMap((r) => r.assessments ?? []);
  const overall = all.length ? all.reduce((n, a) => n + a.score, 0) / all.length : 0;
  const ended = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    ok: true,
    ms: Math.max(1, Math.round(ended - started)),
    session_trend: trend,
    candidate_summary: {
      adaptivity,
      start_difficulty: trend[0]?.difficulty ?? 'medium',
      end_difficulty: trend[trend.length - 1]?.difficulty ?? 'medium',
      overall_avg_score: Math.round(overall * 100) / 100,
      n_rounds: trend.length,
    },
  };
}
