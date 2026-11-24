// Hiring Committee: independent votes -> reveal + one challenge/revise round -> optional targeted follow-up -> chair synthesis.
// Inter-agent messages go through this in-app orchestrator (BAND is NOT used; see README sponsor table).
// Final verdict is NOT a majority vote or an average: the chair weighs evidence and critical gaps in must-have competencies.
import { tryLLM } from './llm.js';

export type Rec = 'strong_hire' | 'hire' | 'no_hire' | 'strong_no_hire';
export const RECS: Rec[] = ['strong_no_hire', 'no_hire', 'hire', 'strong_hire'];
export const REC_LEVEL: Record<Rec, number> = { strong_no_hire: 1, no_hire: 2, hire: 3, strong_hire: 4 };
export const REC_LABEL: Record<Rec, string> = { strong_hire: 'Strong Hire', hire: 'Hire', no_hire: 'No Hire', strong_no_hire: 'Strong No Hire' };
const SCALE = 'Recommendation scale (exactly one): "strong_hire" (4) significantly exceeds role-level expectations; "hire" (3) meets role-level expectations; "no_hire" (2) does not meet important role-level expectations; "strong_no_hire" (1) substantial gaps in fundamental competencies. There is no lean or neutral option.';

type Voter = 'maya' | 'alex';
export const RUBRIC: Record<Voter, { name: string; role: string; competencies: { id: string; label: string; mustHave: boolean }[] }> = {
  maya: { name: 'Maya', role: 'Hiring Manager', competencies: [
    { id: 'product_sense', label: 'Product sense & metric choice', mustHave: true },
    { id: 'experiment_design', label: 'Experiment design (A/B)', mustHave: true },
    { id: 'business_judgment', label: 'Business impact & trade-offs', mustHave: false },
    { id: 'communication', label: 'Structured communication', mustHave: false },
  ] },
  alex: { name: 'Alex', role: 'Technical Interviewer', competencies: [
    { id: 'statistics', label: 'Statistics & power', mustHave: true },
    { id: 'causal_inference', label: 'Causal inference & validity checks', mustHave: true },
    { id: 'analysis_rigor', label: 'Analysis rigor (SRM, guardrails, segments)', mustHave: false },
    { id: 'sql_data', label: 'Data/SQL fluency', mustHave: false },
  ] },
};

export interface Evaluation {
  interviewer: string; role: string; agent: Voter;
  competencies: { id: string; label: string; rating: number | null; must_have: boolean }[];
  recommendation: Rec; confidence: 'low' | 'medium' | 'high';
  evidence: string[]; strengths: string[]; concerns: string[]; critical_gaps: string[]; follow_ups: string[];
  assessment_status: 'complete' | 'insufficient_evidence'; source: 'llm' | 'deterministic';
}
export interface Revision { agent: Voter; challenge: string; revised: Rec; changed: boolean; rationale: string; source: 'llm' | 'deterministic' }
export interface Committee {
  label: string; initial: Evaluation[]; revisions: Revision[];
  votes: { agent: Voter; initial: Rec; revised: Rec }[];
  distribution: Record<Rec, number>; agreement_initial: boolean; agreement_final: boolean; disagreement_levels: number;
  follow_up_question: string | null;
  final: { recommendation: Rec; label: string; rationale: string; not_majority_note: string; source: 'llm' | 'deterministic' };
  improvement_plan: string[]; coverage: { answered_rounds: number; asked_rounds: number; competencies_rated: number; competencies_total: number };
  assessment_status: 'complete' | 'insufficient_evidence';
}

interface RoundIn { question: string; topic: string; difficulty: string; answer?: string; scores?: { agent: string; score: number; evidence: string; gap: string }[] }
const isRec = (x: unknown): x is Rec => typeof x === 'string' && (RECS as string[]).includes(x);
const strs = (x: unknown, n = 4) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).slice(0, n) : []);
const norm = (s: string) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const verbatim = (q: string, answers: string[]) => q.trim().length >= 8 && answers.some((a) => norm(a).includes(norm(q)));
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function insufficient(rounds: RoundIn[]) {
  const answered = rounds.filter((r) => r.answer && wordCount(r.answer) >= 12);
  return answered.length === 0 || answered.reduce((n, r) => n + wordCount(r.answer!), 0) < 30;
}

function detEvaluate(agent: Voter, rounds: RoundIn[]): Evaluation {
  const R = RUBRIC[agent];
  const answers = rounds.map((r) => r.answer ?? '').filter(Boolean);
  const mine = rounds.flatMap((r) => (r.scores ?? []).filter((s) => s.agent === agent));
  const avg5 = mine.length ? mine.reduce((n, s) => n + s.score, 0) / mine.length : 0;
  const lvl = avg5 >= 4.5 ? 4 : avg5 >= 3.5 ? 3 : avg5 >= 2 ? 2 : 1;
  const insuff = insufficient(rounds);
  const competencies = R.competencies.map((c) => ({ id: c.id, label: c.label, must_have: c.mustHave, rating: insuff ? null : lvl }));
  const gaps = mine.filter((s) => s.score <= 2).map((s) => s.gap).slice(0, 3);
  return { interviewer: R.name, role: R.role, agent, competencies, recommendation: (RECS[lvl - 1] ?? 'strong_no_hire'), confidence: insuff ? 'low' : 'medium',
    evidence: mine.map((s) => s.evidence).filter((e) => verbatim(e, answers)).slice(0, 3), strengths: mine.filter((s) => s.score >= 4).map(() => 'Strong, specific answer on this topic').slice(0, 2),
    concerns: mine.filter((s) => s.score <= 3).map((s) => s.gap).slice(0, 3), critical_gaps: gaps, follow_ups: [], assessment_status: insuff ? 'insufficient_evidence' : 'complete', source: 'deterministic' };
}

async function evaluate(agent: Voter, ctx: string, rounds: RoundIn[]): Promise<Evaluation> {
  const R = RUBRIC[agent];
  const det = detEvaluate(agent, rounds);
  const answers = rounds.map((r) => r.answer ?? '').filter(Boolean);
  const raw = (await tryLLM(
    `You are ${R.name}, the ${R.role} on a data-science hiring panel. Evaluate the candidate INDEPENDENTLY (you have not seen any other interviewer's vote). Judge only demonstrated, job-related competencies against the target role and seniority. Rubric (rate each 1-4, or null if not demonstrated/assessable): ${R.competencies.map((c) => `${c.id} = ${c.label}${c.mustHave ? ' [MUST-HAVE]' : ''}`).join('; ')}. ${SCALE} Respond with STRICT JSON only: {"competencies":{"<id>":1-4|null},"recommendation":"...","confidence":"low"|"medium"|"high","evidence":["EXACT verbatim substrings of the candidate answers"],"strengths":["..."],"concerns":["..."],"critical_gaps":["gaps in must-have competencies relative to the role"],"follow_ups":["1-2 follow-up questions"]}`,
    ctx, 700,
  )) as Record<string, unknown> | null;
  if (!raw || !isRec(raw.recommendation)) return det;
  const comp = (raw.competencies ?? {}) as Record<string, unknown>;
  const competencies = R.competencies.map((c) => { const v = Math.round(Number(comp[c.id])); return { id: c.id, label: c.label, must_have: c.mustHave, rating: Number.isFinite(v) && v >= 1 && v <= 4 ? v : null }; });
  const ev = strs(raw.evidence, 4).filter((q) => verbatim(q, answers));
  const insuff = insufficient(rounds);
  return { interviewer: R.name, role: R.role, agent, competencies, recommendation: raw.recommendation, confidence: (['low', 'medium', 'high'].includes(String(raw.confidence)) ? raw.confidence : 'medium') as Evaluation['confidence'],
    evidence: ev.length ? ev : det.evidence, strengths: strs(raw.strengths), concerns: strs(raw.concerns), critical_gaps: strs(raw.critical_gaps), follow_ups: strs(raw.follow_ups, 2),
    assessment_status: insuff ? 'insufficient_evidence' : 'complete', source: 'llm' };
}

async function challenge(me: Evaluation, other: Evaluation, ctx: string): Promise<Revision> {
  const raw = (await tryLLM(
    `You are ${me.interviewer}, the ${me.role}. Votes are now revealed. Review the other interviewer's vote and evidence. Challenge it ONLY with observable evidence from the candidate's answers or rubric criteria, then decide whether to keep or revise YOUR recommendation based on evidence (not to conform). ${SCALE} Respond with STRICT JSON only: {"challenge":"one or two sentences addressed to ${other.interviewer}","revised":"...","rationale":"one sentence citing evidence"}`,
    `${ctx}\n\nYOUR initial vote: ${JSON.stringify({ recommendation: me.recommendation, competencies: me.competencies, evidence: me.evidence, critical_gaps: me.critical_gaps })}\n${other.interviewer}'s vote: ${JSON.stringify({ recommendation: other.recommendation, competencies: other.competencies, evidence: other.evidence, critical_gaps: other.critical_gaps })}`,
    400,
  )) as Record<string, unknown> | null;
  if (raw && isRec(raw.revised) && typeof raw.challenge === 'string') return { agent: me.agent, challenge: raw.challenge, revised: raw.revised, changed: raw.revised !== me.recommendation, rationale: String(raw.rationale ?? ''), source: 'llm' };
  return { agent: me.agent, challenge: `${other.interviewer} voted ${REC_LABEL[other.recommendation]}; my evidence supports ${REC_LABEL[me.recommendation]}.`, revised: me.recommendation, changed: false, rationale: 'No new evidence; vote kept.', source: 'deterministic' };
}

/** Deterministic chair rule (fallback): not an average. A critical gap in a must-have competency caps at No Hire; insufficient evidence caps at No Hire. */
function detChair(evals: Evaluation[], revised: Rec[]): { recommendation: Rec; rationale: string } {
  const mustLow = evals.some((e) => e.competencies.some((c) => c.must_have && c.rating != null && c.rating <= 1));
  const mustGap = evals.some((e) => e.competencies.some((c) => c.must_have && c.rating != null && c.rating <= 2)) || evals.some((e) => e.critical_gaps.length > 0);
  const best = Math.max(...revised.map((r) => REC_LEVEL[r])), worst = Math.min(...revised.map((r) => REC_LEVEL[r]));
  if (evals.every((e) => e.assessment_status === 'insufficient_evidence')) return { recommendation: 'no_hire', rationale: 'Insufficient evidence to establish must-have competencies; cannot recommend hire.' };
  if (mustLow) return { recommendation: 'strong_no_hire', rationale: 'A must-have competency was rated 1 (fundamental gap).' };
  if (mustGap) return { recommendation: 'no_hire', rationale: 'A critical gap in a must-have competency caps the verdict at No Hire regardless of other strengths.' };
  return { recommendation: RECS[Math.min(best, worst + 1) - 1], rationale: 'All must-have competencies demonstrated; verdict follows the weakest well-evidenced vote plus one at most.' };
}

export async function runCommittee(company: string, role: string, rounds: RoundIn[]): Promise<Committee> {
  const ctx = `Target role: ${role} at ${company} (mid-level). Interview transcript:\n${rounds.map((r, i) => `R${i + 1} [${r.topic}, ${r.difficulty}] Q: ${r.question}\nA: ${r.answer ? `"""${r.answer}"""` : '(not answered)'}`).join('\n')}`;
  const initial = await Promise.all((['maya', 'alex'] as Voter[]).map((a) => evaluate(a, ctx, rounds)));
  const revisions = await Promise.all([challenge(initial[0], initial[1], ctx), challenge(initial[1], initial[0], ctx)]);
  const votes = initial.map((e, i) => ({ agent: e.agent, initial: e.recommendation, revised: revisions[i].revised }));
  const distribution = Object.fromEntries(RECS.map((r) => [r, votes.filter((v) => v.revised === r).length])) as Record<Rec, number>;
  const lv = (r: Rec) => REC_LEVEL[r];
  const disagreement_levels = Math.abs(lv(votes[0].initial) - lv(votes[1].initial));
  const split = (lv(votes[0].revised) >= 3) !== (lv(votes[1].revised) >= 3);
  const insuff = initial.every((e) => e.assessment_status === 'insufficient_evidence') || insufficient(rounds);
  const det = detChair(initial, votes.map((v) => v.revised));
  const raw = (await tryLLM(
    `You are Jordan, the Committee Chair. Synthesize the FINAL committee recommendation from the evidence and critical competency gaps relative to the target role and seniority. Do NOT decide by majority vote or by averaging; explain which evidence and which must-have gaps drove the decision. If evidence is insufficient (incomplete answers), do not recommend hire. ${SCALE} Respond with STRICT JSON only: {"recommendation":"...","rationale":"2-3 sentences citing evidence and gaps","follow_up_question":"one targeted question to resolve the disagreement, or empty string","improvement_plan":["3 concrete, personalized steps based on the gaps"]}`,
    `${ctx}\n\nIndependent evaluations: ${JSON.stringify(initial.map((e) => ({ interviewer: e.interviewer, recommendation: e.recommendation, confidence: e.confidence, competencies: e.competencies, evidence: e.evidence, critical_gaps: e.critical_gaps, status: e.assessment_status })))}\nChallenge round: ${JSON.stringify(revisions)}\nDisagreement: ${disagreement_levels} level(s)${split ? ', hire vs no-hire split' : ''}. Assessment status: ${insuff ? 'insufficient_evidence' : 'complete'}.`,
    700,
  )) as Record<string, unknown> | null;
  let final = { recommendation: det.recommendation, rationale: det.rationale, source: 'deterministic' as 'llm' | 'deterministic' };
  if (raw && isRec(raw.recommendation) && typeof raw.rationale === 'string') final = { recommendation: raw.recommendation, rationale: raw.rationale, source: 'llm' };
  if (insuff && lv(final.recommendation) >= 3) final = { recommendation: 'no_hire', rationale: `${final.rationale} (Capped: insufficient evidence cannot support a hire.)`, source: final.source };
  const needFollow = disagreement_levels >= 2 || split;
  const follow = needFollow ? (typeof raw?.follow_up_question === 'string' && raw.follow_up_question.trim() ? raw.follow_up_question : initial.flatMap((e) => e.follow_ups)[0] ?? 'Walk us through how you would validate the result you described, step by step.') : null;
  const plan = strs(raw?.improvement_plan, 4);
  const allComp = initial.flatMap((e) => e.competencies);
  return {
    label: 'Simulated interview feedback — not a real employer hiring decision.',
    initial, revisions, votes, distribution,
    agreement_initial: votes[0].initial === votes[1].initial, agreement_final: votes[0].revised === votes[1].revised, disagreement_levels,
    follow_up_question: follow,
    final: { ...final, label: REC_LABEL[final.recommendation], not_majority_note: 'Chair synthesis from evidence and must-have competency gaps; not a majority vote or score average.' },
    improvement_plan: plan.length ? plan : initial.flatMap((e) => e.critical_gaps.concat(e.concerns)).slice(0, 3).map((g) => `Practice: ${g}`),
    coverage: { answered_rounds: rounds.filter((r) => r.answer).length, asked_rounds: rounds.length, competencies_rated: allComp.filter((c) => c.rating != null).length, competencies_total: allComp.length },
    assessment_status: insuff ? 'insufficient_evidence' : 'complete',
  };
}
