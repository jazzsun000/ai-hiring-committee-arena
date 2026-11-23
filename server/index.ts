import express from 'express';
import crypto from 'node:crypto';
import { TOPICS, topicById, type Difficulty } from './bank.js';
import { scoreDeterministic, nextDifficulty, type Assessment } from './deterministic.js';
import { appendEvent, EVENTS_FILE } from './events.js';
import { runAnalytics } from './analytics.js';
import { ensureMode, state, tryLLM, model } from './llm.js';

type Scorer = 'maya' | 'alex';
interface Question { round: number; asker: Scorer; topic: string; topicLabel: string; difficulty: Difficulty; text: string; reason: string; trend: 'up' | 'down' | 'flat' | 'start'; source: 'llm' | 'deterministic' }
interface Round { question: Question; answer?: string; assessments?: Assessment[] }
interface Session { id: string; company: string; role: string; rounds: Round[]; scorecard?: unknown }

const sessions = new Map<string, Session>();
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const trendOf = (prev: Difficulty, next: Difficulty) => {
  const d = DIFFS.indexOf(next) - DIFFS.indexOf(prev);
  return d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
};
const fill = (t: string, s: Session) => t.replaceAll('{company}', s.company).replaceAll('{role}', s.role);

const PERSONA: Record<Scorer, string> = {
  maya: 'You are Maya, the Hiring Manager on a data science interview panel. Your lens: product sense, metrics, A/B testing, business impact.',
  alex: 'You are Alex, the Technical Interviewer. Your lens: statistics, SQL, experimentation rigor, causal inference.',
};

function clampScore(n: unknown): number | null {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 1 && v <= 5 ? v : null;
}

/** Normalize whitespace/quotes for verbatim checks. */
const norm = (s: string) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const isVerbatim = (quote: string, answers: string[]) => quote.trim().length >= 8 && answers.some((a) => norm(a).includes(norm(quote)));

async function assess(agent: Scorer, s: Session, r: Round): Promise<Assessment> {
  const answer = r.answer ?? '';
  const raw = (await tryLLM(
    `${PERSONA[agent]} Score the candidate independently. Respond with STRICT JSON only: {"score": integer 1-5, "evidence": "an EXACT verbatim substring copied from the candidate answer", "gap": "one sentence on what is missing"}.`,
    `Company: ${s.company}. Role: ${s.role}.\nQuestion (${r.question.topicLabel}, ${r.question.difficulty}): ${r.question.text}\nCandidate answer:\n"""${answer}"""`,
  )) as { score?: unknown; evidence?: unknown; gap?: unknown } | null;
  const score = clampScore(raw?.score);
  if (raw && score && typeof raw.gap === 'string') {
    const det = scoreDeterministic(agent, answer, r.question.topic);
    const evidence = typeof raw.evidence === 'string' && isVerbatim(raw.evidence, [answer]) ? raw.evidence : det.evidence;
    return { agent, score, evidence, gap: raw.gap, source: 'llm' };
  }
  return scoreDeterministic(agent, answer, r.question.topic);
}

function deterministicNext(s: Session, last: Round): Question {
  const a = last.assessments ?? [];
  const avg = a.reduce((n, x) => n + x.score, 0) / Math.max(1, a.length);
  const prevQ = last.question;
  const difficulty = nextDifficulty(avg, prevQ.difficulty);
  const used = new Set(s.rounds.map((r) => `${r.question.topic}:${r.question.difficulty}`));
  let asker: Scorer;
  let topic: string;
  let reason: string;
  const gap = a.map((x) => x.gap).find((g) => g.startsWith('Did not address')) ?? a[0]?.gap ?? '';
  if (avg >= 3.5) {
    asker = prevQ.asker === 'maya' ? 'alex' : 'maya';
    const order = asker === 'alex' ? ['causal', 'sql'] : ['ab_testing', 'metrics'];
    topic = order.find((t) => !used.has(`${t}:${difficulty}`)) ?? order[0];
    reason = `Raised difficulty: avg ${avg.toFixed(1)}/5, candidate cited "${a[0]?.evidence.slice(0, 70)}". Handing to ${asker === 'alex' ? 'Alex' : 'Maya'} for a harder ${topicById(topic).label} question.`;
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
  const t = topicById(topic);
  return {
    round: last.question.round + 1, asker, topic, topicLabel: t.label, difficulty,
    text: fill(t.questions[difficulty], s), reason: reason.replace(/\s+/g, ' ').trim(),
    trend: trendOf(prevQ.difficulty, difficulty), source: 'deterministic',
  };
}

async function decideNext(s: Session, last: Round): Promise<Question> {
  const det = deterministicNext(s, last);
  const raw = (await tryLLM(
    'You are Jordan, the Evaluator. Merge Maya and Alex\'s assessments and decide the next question. Rule: if the average score >= 3.5 raise difficulty; if < 2.5 lower difficulty or probe the same topic; else keep. Respond with STRICT JSON only: {"next_agent":"maya"|"alex","topic":"metrics"|"ab_testing"|"sql"|"causal","difficulty":"easy"|"medium"|"hard","question":"the next interview question, one or two sentences","reason":"one plain-English sentence that references the candidate answer"}',
    `Company: ${s.company}. Role: ${s.role}.\nLast question (${last.question.topicLabel}, ${last.question.difficulty}): ${last.question.text}\nAnswer: """${last.answer}"""\nAssessments: ${JSON.stringify(last.assessments)}\nAlready asked: ${s.rounds.map((r) => r.question.topic + '/' + r.question.difficulty).join(', ')}`,
  )) as Record<string, unknown> | null;
  if (raw && (raw.next_agent === 'maya' || raw.next_agent === 'alex') && TOPICS.some((t) => t.id === raw.topic) && DIFFS.includes(raw.difficulty as Difficulty) && typeof raw.question === 'string' && raw.question.length > 10 && typeof raw.reason === 'string') {
    const difficulty = raw.difficulty as Difficulty;
    return { ...det, asker: raw.next_agent, topic: raw.topic as string, topicLabel: topicById(raw.topic as string).label, difficulty, text: raw.question, reason: raw.reason, trend: trendOf(last.question.difficulty, difficulty), source: 'llm' };
  }
  return det;
}

function log(s: Session, round: number, type: Parameters<typeof appendEvent>[0]['type'], agent: string, extra: Record<string, unknown> = {}) {
  appendEvent({ session_id: s.id, round, type, agent, topic: null, difficulty: null, score: null, reason: null, text: null, ...extra });
}

function logQuestion(s: Session, q: Question) {
  log(s, q.round, 'decision', 'jordan', { topic: q.topic, difficulty: q.difficulty, reason: q.reason, text: `Next asker: ${q.asker}` });
  log(s, q.round, 'question', q.asker, { topic: q.topic, difficulty: q.difficulty, text: q.text });
}

function pickQuotes(answers: string[], n: number): string[] {
  const out: string[] = [];
  for (const a of answers) {
    const parts = a.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 4);
    const best = parts.sort((x, y) => y.length - x.length)[0] ?? a.trim();
    if (best && !out.includes(best)) out.push(best.length > 200 ? best.slice(0, 200) : best);
  }
  // still short (e.g. 1 answer): take more sentences from all answers
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

async function buildScorecard(s: Session) {
  const done = s.rounds.filter((r) => r.answer && r.assessments);
  const answers = done.map((r) => r.answer!);
  const all = done.flatMap((r) => r.assessments!);
  const overall = all.length ? all.reduce((n, a) => n + a.score, 0) / all.length : 0;
  const skills = done.flatMap((r) => r.assessments!.map((a) => ({ skill: `R${r.question.round} ${r.question.topicLabel} (${r.question.difficulty}) · ${a.agent === "maya" ? "Maya" : "Alex"}`, score: a.score, evidence: a.evidence, gap: a.gap, assessedBy: a.agent })));
  let summary = `${done.length} round(s) completed. Average ${overall.toFixed(1)}/5 across ${all.length} independent assessments.`;
  let quotes: string[] = [];
  let source: 'llm' | 'deterministic' = 'deterministic';
  const raw = (await tryLLM(
    'You are Jordan, the Evaluator, writing the final scorecard. Respond with STRICT JSON only: {"summary":"3 sentences","quotes":["at least 2 EXACT verbatim substrings copied from the candidate answers"]}',
    `Company: ${s.company}. Role: ${s.role}. Rounds: ${JSON.stringify(done.map((r) => ({ q: r.question.text, answer: r.answer, assessments: r.assessments })))}`,
    600,
  )) as { summary?: unknown; quotes?: unknown } | null;
  if (raw && typeof raw.summary === 'string') { summary = raw.summary; source = 'llm'; }
  if (raw && Array.isArray(raw.quotes)) quotes = raw.quotes.filter((q): q is string => typeof q === 'string' && isVerbatim(q, answers));
  // Enforce >= 2 verbatim quotes from what the candidate actually typed.
  if (quotes.length < 2) for (const q of [...done.map((r) => r.assessments![0].evidence).filter((e) => isVerbatim(e, answers)), ...pickQuotes(answers, 2)]) if (quotes.length < 2 && !quotes.includes(q)) quotes.push(q);
  const card = { company: s.company, role: s.role, overall: Math.round(overall * 10) / 10, recommendation: done.length ? recFor(overall) : 'no_hire', summary, quotes, skills, rounds: done.length, source };
  s.scorecard = card;
  log(s, done.length, 'scorecard', 'jordan', { score: card.overall, reason: `Recommendation: ${card.recommendation}`, text: JSON.stringify({ summary, quotes }) });
  return card;
}

const app = express();
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', async (_req, res) => { await ensureMode(); res.json({ ok: true, mode: state.mode, reason: state.reason, key_source: state.keySource, model: state.mode === 'live' ? model() : null, lastError: state.lastError || null, events_file: 'analytics/data/events.jsonl' }); });

app.post('/api/events', (req, res) => {
  try { res.json({ ok: true, event: appendEvent(req.body ?? {}) }); }
  catch (e) { res.status(400).json({ ok: false, error: (e as Error).message }); }
});

app.post('/api/session', (req, res) => {
  const company = String(req.body?.company || 'Acme').slice(0, 60);
  const role = String(req.body?.role || 'Product Data Scientist').slice(0, 60);
  const s: Session = { id: crypto.randomUUID(), company, role, rounds: [] };
  sessions.set(s.id, s);
  const t = topicById('metrics');
  const q: Question = { round: 1, asker: 'maya', topic: t.id, topicLabel: t.label, difficulty: 'medium', text: fill(t.questions.medium, s), reason: 'Opening: Maya starts with a medium product-metrics question to calibrate.', trend: 'start', source: 'deterministic' };
  s.rounds.push({ question: q });
  logQuestion(s, q);
  res.json({ session_id: s.id, mode: state.mode, question: q });
});

// Submit an answer for the current round: Maya & Alex score in parallel, Jordan picks the next question.
app.post('/api/answer', async (req, res) => {
  const s = sessions.get(req.body?.session_id);
  if (!s) return res.status(404).json({ error: 'unknown session' });
  const answer = String(req.body?.answer ?? '').trim();
  if (!answer) return res.status(400).json({ error: 'answer required' });
  const r = s.rounds[s.rounds.length - 1];
  if (r.answer) return res.status(409).json({ error: 'round already answered' });
  r.answer = answer.slice(0, 4000);
  log(s, r.question.round, 'answer', 'candidate', { topic: r.question.topic, difficulty: r.question.difficulty, text: r.answer });
  r.assessments = await Promise.all((['maya', 'alex'] as Scorer[]).map((a) => assess(a, s, r)));
  for (const a of r.assessments) log(s, r.question.round, 'assessment', a.agent, { topic: r.question.topic, difficulty: r.question.difficulty, score: a.score, reason: a.gap, text: a.evidence });
  res.json({ round: r.question.round, assessments: r.assessments, mode: state.mode });
});

app.post('/api/next', async (req, res) => {
  const s = sessions.get(req.body?.session_id);
  if (!s) return res.status(404).json({ error: 'unknown session' });
  const last = s.rounds[s.rounds.length - 1];
  if (!last.assessments) return res.status(409).json({ error: 'answer current round first' });
  const q = await decideNext(s, last);
  s.rounds.push({ question: q });
  logQuestion(s, q);
  res.json({ question: q, mode: state.mode });
});

app.post('/api/scorecard', async (req, res) => {
  const s = sessions.get(req.body?.session_id);
  if (!s) return res.status(404).json({ error: 'unknown session' });
  res.json(await buildScorecard(s));
});

app.post('/api/analytics/run', async (req, res) => {
  try { res.json(await runAnalytics(String(req.body?.session_id ?? ''))); }
  catch (e) { res.status(500).json({ ok: false, error: (e as Error).message }); }
});

const PORT = Number(process.env.PORT || 8787);
ensureMode(true).finally(() => {
  app.listen(PORT, () => console.log(`[api] http://localhost:${PORT} mode=${state.mode} (${state.reason}) events -> ${EVENTS_FILE}`));
});
