import type { AgentId } from './types';
import { AGENTS } from './types';

export interface LedgerRow {
  id?: string;
  /** ISO string, Date, or preformatted text like "12:31:04". */
  time: string | Date;
  agent: AgentId;
  decision: string;
  reason: string;
  round?: number;
}

export interface DecisionLedgerProps {
  rows: LedgerRow[];
  title?: string;
  emptyText?: string;
}

function fmtTime(t: string | Date) {
  const d = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(d.getTime())) return String(t);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function AgentChip({ agent }: { agent: AgentId }) {
  const m = AGENTS[agent];
  return (
    <span className={`agent-chip agent-chip--${agent}`} style={{ ['--av-color' as string]: m.color }}>
      <span className="agent-chip-dot" />
      {m.name}
    </span>
  );
}

export function DecisionLedger({ rows, title = 'Decision ledger', emptyText = 'Decisions will appear here as the committee works.' }: DecisionLedgerProps) {
  return (
    <section className="panel ledger">
      <header className="panel-head">
        <h3>{title}</h3>
        <span className="panel-count">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="panel-empty">{emptyText}</p>
      ) : (
        <ol className="ledger-list">
          {rows.map((r, i) => (
            <li key={r.id ?? i} className={`ledger-row ledger-item${i === rows.length - 1 ? ' ledger-item--new' : ''}`} style={{ ['--av-color' as string]: AGENTS[r.agent].color }}>
              <div className="ledger-meta">
                {r.round != null && <span className="ledger-round">R{r.round}</span>}
                <AgentChip agent={r.agent} />
                <span className="ledger-time mono">{fmtTime(r.time)}</span>
              </div>
              <p className="ledger-decision">{r.decision}</p>
              <p className="ledger-reason">{r.reason}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default DecisionLedger;
