export type DifficultyDelta = 'up' | 'down' | 'same';

export interface QuestionChipProps {
  topic: string;
  /** 1-5 */
  difficulty: number;
  delta?: DifficultyDelta;
  /** Jordan's one-sentence reason for this question. */
  reason?: string;
  /** Re-trigger the highlight animation when this changes (e.g. round number). */
  highlightKey?: string | number;
}

const DIFF_LABEL = ['', 'Easy', 'Easy+', 'Medium', 'Hard', 'Expert'];
const DELTA_LABEL: Record<DifficultyDelta, string> = { up: 'Harder', down: 'Easier', same: 'Same level' };

export function QuestionChip({ topic, difficulty, delta = 'same', reason, highlightKey }: QuestionChipProps) {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return (
    <div className={`qchip qchip--${delta}`} key={highlightKey}>
      <div className="qchip-pill">
        <span className="qchip-topic">{topic}</span>
        <span className="qchip-sep" />
        <span className="qchip-dots" aria-label={`Difficulty ${d} of 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={n <= d ? 'on' : ''} />
          ))}
        </span>
        <span className="qchip-level">{DIFF_LABEL[d]}</span>
        <span className={`qchip-delta qchip-delta--${delta}`} title={DELTA_LABEL[delta]}>
          {delta === 'up' ? '↑' : delta === 'down' ? '↓' : '→'} {DELTA_LABEL[delta]}
        </span>
      </div>
      {reason && (
        <p className="qchip-reason">
          <span className="qchip-reason-by">Jordan:</span> {reason}
        </p>
      )}
    </div>
  );
}

export default QuestionChip;
