import { Avatar } from './arena/Avatar';

export type Rec = 'strong_hire' | 'hire' | 'no_hire' | 'strong_no_hire';
const LABEL: Record<Rec, string> = { strong_hire: 'Strong Hire (4)', hire: 'Hire (3)', no_hire: 'No Hire (2)', strong_no_hire: 'Strong No Hire (1)' };
const ORDER: Rec[] = ['strong_hire', 'hire', 'no_hire', 'strong_no_hire'];
interface Comp { id: string; label: string; rating: number | null; must_have: boolean }
interface Evaluation { interviewer: string; role: string; agent: 'maya' | 'alex'; competencies: Comp[]; recommendation: Rec; confidence: string; evidence: string[]; strengths: string[]; concerns: string[]; critical_gaps: string[]; follow_ups: string[]; assessment_status: 'complete' | 'insufficient_evidence'; source: string }
export interface CommitteeData {
  label: string; initial: Evaluation[];
  revisions: { agent: 'maya' | 'alex'; challenge: string; revised: Rec; changed: boolean; rationale: string }[];
  votes: { agent: 'maya' | 'alex'; initial: Rec; revised: Rec }[];
  distribution: Record<Rec, number>; agreement_initial: boolean; agreement_final: boolean; disagreement_levels: number;
  follow_up_question: string | null;
  final: { recommendation: Rec; label: string; rationale: string; not_majority_note: string; source: string };
  improvement_plan: string[]; coverage: { answered_rounds: number; asked_rounds: number; competencies_rated: number; competencies_total: number };
  assessment_status: 'complete' | 'insufficient_evidence';
}

export function CommitteeRoom({ data }: { data: CommitteeData }) {
  return (
    <section className="panel committee" data-testid="committee-room">
      <p className="overline">Hiring Committee Room</p>
      <p className="committee-label" data-testid="sim-label">{data.label}</p>
      {data.assessment_status === 'insufficient_evidence' && <p className="committee-insuff" data-testid="insufficient">Assessment status: Insufficient evidence (answers too incomplete to assess must-have competencies).</p>}
      <div className="committee-seats">
        {data.initial.map((e) => {
          const v = data.votes.find((x) => x.agent === e.agent)!;
          return (
            <div key={e.agent} className="committee-seat" data-testid={`vote-${e.agent}`}>
              <Avatar agent={e.agent} state={v.revised === 'strong_hire' || v.revised === 'hire' ? 'pleased' : 'concerned'} size={84} />
              <b>{e.interviewer}</b><span className="muted">{e.role}</span>
              <span className="muted">Initial: <span className={`rec rec--${v.initial}`}>{LABEL[v.initial]}</span></span>
              <span className="muted">Revised: <span className={`rec rec--${v.revised}`}>{LABEL[v.revised]}</span>{v.revised !== v.initial ? ' (changed)' : ''}</span>
              <span className="muted">Confidence: {e.confidence}</span>
            </div>
          );
        })}
        <div className="committee-seat" data-testid="vote-jordan">
          <Avatar agent="jordan" state="speaking" size={84} />
          <b>Jordan</b><span className="muted">Committee Chair</span>
          <span>Final: <span className={`rec rec--${data.final.recommendation}`} data-testid="final-verdict">{data.final.label}</span></span>
        </div>
      </div>
      <p className="muted" data-testid="vote-distribution">Vote distribution (revised): {ORDER.map((r) => `${LABEL[r]}: ${data.distribution[r] ?? 0}`).join(' · ')} · Initial agreement: {data.agreement_initial ? 'yes' : `no (${data.disagreement_levels} level gap)`} · Final agreement: {data.agreement_final ? 'yes' : 'no'}</p>
      <h4>Committee verdict</h4>
      <p data-testid="final-rationale">{data.final.rationale}</p>
      <p className="muted">{data.final.not_majority_note}</p>
      <h4>Committee discussion</h4>
      <ul data-testid="discussion">
        {data.revisions.map((r) => <li key={r.agent}><b>{r.agent === 'maya' ? 'Maya' : 'Alex'}:</b> {r.challenge} <span className="muted">{r.rationale}</span></li>)}
        {data.follow_up_question && <li data-testid="follow-up"><b>Jordan (targeted follow-up):</b> {data.follow_up_question}</li>}
      </ul>
      <h4>Competency ratings &amp; evidence</h4>
      {data.initial.map((e) => (
        <div key={e.agent} className="committee-eval">
          <b>{e.interviewer}</b>
          <ul>{e.competencies.map((c) => <li key={c.id}>{c.label}{c.must_have ? ' (must-have)' : ''}: <b>{c.rating ?? 'not assessed'}</b>{c.rating ? '/4' : ''}</li>)}</ul>
          {e.evidence.map((q) => <blockquote key={q}>“{q}”</blockquote>)}
          {e.strengths.length > 0 && <p><b>Strengths:</b> {e.strengths.join('; ')}</p>}
          {e.concerns.length > 0 && <p><b>Concerns:</b> {e.concerns.join('; ')}</p>}
          {e.critical_gaps.length > 0 && <p><b>Critical gaps:</b> {e.critical_gaps.join('; ')}</p>}
          {e.follow_ups.length > 0 && <p><b>Follow-ups:</b> {e.follow_ups.join(' ')}</p>}
        </div>
      ))}
      <h4>Personalized improvement plan</h4>
      <ol data-testid="improvement-plan">{data.improvement_plan.map((p) => <li key={p}>{p}</li>)}</ol>
      <p className="muted">Coverage: {data.coverage.answered_rounds}/{data.coverage.asked_rounds} rounds answered · {data.coverage.competencies_rated}/{data.coverage.competencies_total} competency ratings. Only demonstrated, job-related competencies are evaluated.</p>
    </section>
  );
}
