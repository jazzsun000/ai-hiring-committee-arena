import type { AgentId } from './types';
import { AgentChip } from './DecisionLedger';

export type HireRecommendation = 'strong_hire' | 'hire' | 'no_hire' | 'strong_no_hire';

export interface SkillScore {
  skill: string;
  /** 1-5 */
  score: number;
  /** Direct quote from the candidate's answer. */
  evidence?: string;
  gap?: string;
  assessedBy?: AgentId;
}

export interface ScorecardProps {
  candidate?: string;
  role?: string;
  company?: string;
  skills: SkillScore[];
  recommendation: HireRecommendation;
  summary?: string;
  overall?: number;
}

const REC_LABEL: Record<HireRecommendation, string> = {
  strong_hire: 'Strong Hire (4)',
  hire: 'Hire (3)',
  no_hire: 'No Hire (2)',
  strong_no_hire: 'Strong No Hire (1)',
};

function tone(score: number) {
  if (score >= 4) return 'good';
  if (score >= 3) return 'mid';
  return 'low';
}

export function Scorecard({ candidate, role, company, skills, recommendation, summary, overall }: ScorecardProps) {
  const avg = overall ?? (skills.length ? skills.reduce((s, k) => s + k.score, 0) / skills.length : 0);
  return (
    <section className="panel scorecard">
      <header className="scorecard-head">
        <div>
          <p className="overline">Final scorecard</p>
          <h3>{candidate ?? 'Candidate'}</h3>
          {(role || company) && <p className="muted">{[role, company].filter(Boolean).join(' · ')}</p>}
        </div>
        <div className="scorecard-verdict">
          <span className={`rec rec--${recommendation}`}>{REC_LABEL[recommendation]}</span>
          <span className="scorecard-overall mono">
            {avg.toFixed(1)}
            <small>/5</small>
          </span>
        </div>
      </header>
      {summary && <p className="scorecard-summary">{summary}</p>}
      <ul className="skill-list">
        {skills.map((s) => (
          <li key={s.skill} className={`skill skill--${tone(s.score)}`}>
            <div className="skill-top">
              <span className="skill-name">{s.skill}</span>
              {s.assessedBy && <AgentChip agent={s.assessedBy} />}
              <span className="skill-score mono">{s.score}/5</span>
            </div>
            <div className="skill-bar" aria-hidden>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={n <= Math.round(s.score) ? 'on' : ''} />
              ))}
            </div>
            {s.evidence && <blockquote className="skill-evidence">“{s.evidence}”</blockquote>}
            {s.gap && <p className="skill-gap">Gap: {s.gap}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default Scorecard;
