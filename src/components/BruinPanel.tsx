export interface TrendRow { round: number; avg_score: number | null; difficulty: string; prev_difficulty: string | null; difficulty_rose: boolean; adaptivity: boolean }
export interface BruinResult { ok: boolean; ms: number; session_trend: TrendRow[]; candidate_summary: { adaptivity: boolean; start_difficulty: string; end_difficulty: string; overall_avg_score: number; n_rounds: number } | null }

export function BruinPanel({ data, loading, error, onRetry }: { data: BruinResult | null; loading: boolean; error: string | null; onRetry: () => void }) {
  return (
    <div className="panel bruin-panel" data-testid="bruin-panel">
      <p className="overline">Bruin analytics · DuckDB marts</p>
      {loading && <p className="muted" role="status">Running Bruin pipeline (ingest → DuckDB → marts)…</p>}
      {error && <p className="bruin-error">Bruin run failed: {error} <button className="btn" onClick={onRetry}>Retry</button></p>}
      {data && (
        <>
          <table className="bruin-table">
            <thead><tr><th>Round</th><th>Avg score</th><th>Difficulty</th><th>Adapted</th></tr></thead>
            <tbody>
              {data.session_trend.map((r) => (
                <tr key={r.round}>
                  <td>R{r.round}</td>
                  <td className="mono">{r.avg_score == null ? 'not answered' : `${Number(r.avg_score).toFixed(1)}/5`}</td>
                  <td>{r.prev_difficulty ? `${r.prev_difficulty} → ${r.difficulty}` : r.difficulty}</td>
                  <td>{r.round === 1 ? '—' : r.adaptivity ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.candidate_summary && (
            <p className="muted" data-testid="bruin-adaptivity">
              Difficulty {data.candidate_summary.start_difficulty} → {data.candidate_summary.end_difficulty} · adaptivity=<b>{String(data.candidate_summary.adaptivity)}</b> · pipeline {Math.round(data.ms / 100) / 10}s
            </p>
          )}
        </>
      )}
    </div>
  );
}
