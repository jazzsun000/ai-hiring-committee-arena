import type { ReactNode } from 'react';
import { Avatar } from './Avatar';
import type { AgentId, AvatarState } from './types';
import { AGENTS, AGENT_ORDER } from './types';

export interface ArenaProps {
  activeAgent: AgentId | null;
  states: Partial<Record<AgentId, AvatarState>>;
  /** Text shown in the speech bubble over the active speaker. */
  bubble?: ReactNode;
  /** Optional small header line, e.g. "Round 2 · Product sense · Medium". */
  caption?: ReactNode;
  names?: Partial<Record<AgentId, string>>;
  /** Per-seat status line, e.g. { maya: 'Scoring…' }. Thinking seats default to 'Thinking…'. */
  statusLabels?: Partial<Record<AgentId, string>>;
}

export function Arena({ activeAgent, states, bubble, caption, names, statusLabels }: ArenaProps) {
  return (
    <section className={`arena${activeAgent && bubble ? ' arena--has-bubble' : ''}`} aria-label="Interview arena">
      {caption && <div className="arena-caption">{caption}</div>}
      <div className="arena-floor" aria-hidden />
      <div className="arena-row">
        {AGENT_ORDER.map((id) => {
          const isActive = id === activeAgent;
          const state = states[id] ?? (isActive ? 'speaking' : 'idle');
          const anyThinking = AGENT_ORDER.some((a) => states[a] === 'thinking');
          const dim = !!activeAgent && !isActive && state !== 'thinking';
          const status =
            statusLabels?.[id] ??
            (isActive && state === 'speaking' ? 'Speaking' : state === 'thinking' ? 'Thinking…' : undefined);
          return (
            <div
              key={id}
              className={`arena-seat${isActive ? ' arena-seat--active' : ''}${dim ? ' arena-seat--dim' : ''}${state === 'thinking' ? ' arena-seat--thinking' : ''}${anyThinking ? ' arena-seat--scoring' : ''}`}
              style={{ ['--av-color' as string]: AGENTS[id].color }}
            >
              <div className="arena-bubble-slot">
                {isActive && bubble && (
                  <div className="arena-bubble" role="status" aria-live="polite">
                    <span className="arena-bubble-name">{names?.[id] ?? AGENTS[id].name}</span>
                    <div className="arena-bubble-text">{bubble}</div>
                  </div>
                )}
              </div>
              <Avatar agent={id} state={state} name={names?.[id]} size={150} />
              <div className="arena-spot" aria-hidden />
              <div className={`arena-status${status ? ' arena-status--on' : ''}`} aria-live="polite">
                {status && (
                  <>
                    {isActive && state === 'speaking' && <span className="arena-status-live" />}
                    {state === 'thinking' && <span className="arena-status-spin" />}
                    <span>
                      {names?.[id] ?? AGENTS[id].name} · {status}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default Arena;
