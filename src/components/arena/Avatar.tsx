import type { AgentId, AvatarState } from './types';
import { AGENTS } from './types';

export interface AvatarProps {
  agent: AgentId;
  state?: AvatarState;
  name?: string;
  showLabel?: boolean;
  size?: number;
}

const SKIN: Record<AgentId, string> = { maya: '#F2C9A8', alex: '#C98E66', jordan: '#8D5A3B' };
const HAIR: Record<AgentId, string> = { maya: '#3B1F4A', alex: '#1E293B', jordan: '#1C1917' };
const OUTFIT: Record<AgentId, { main: string; dark: string }> = {
  maya: { main: '#8B5CF6', dark: '#6D28D9' },
  alex: { main: '#06B6D4', dark: '#0E7490' },
  jordan: { main: '#F59E0B', dark: '#B45309' },
};

function Mouth({ state }: { state: AvatarState }) {
  switch (state) {
    case 'speaking':
      return <ellipse className="av-mouth av-mouth--talk" cx="60" cy="72" rx="6" ry="4.5" fill="#5B1E1E" />;
    case 'pleased':
      return <path className="av-mouth" d="M49 68 Q60 82 71 68 Q60 74 49 68 Z" fill="#5B1E1E" stroke="#5B1E1E" strokeWidth="1.5" strokeLinejoin="round" />;
    case 'concerned':
      return <path className="av-mouth" d="M51 75 Q60 68 69 75" fill="none" stroke="#3F1D1D" strokeWidth="2.5" strokeLinecap="round" />;
    case 'thinking':
      return <path className="av-mouth" d="M53 72 L66 70" fill="none" stroke="#3F1D1D" strokeWidth="2.5" strokeLinecap="round" />;
    default:
      return <path className="av-mouth" d="M52 71 Q60 76 68 71" fill="none" stroke="#3F1D1D" strokeWidth="2.5" strokeLinecap="round" />;
  }
}

function Brows({ state, color }: { state: AvatarState; color: string }) {
  const common = { stroke: color, strokeWidth: 3, strokeLinecap: 'round' as const, fill: 'none' };
  if (state === 'concerned')
    return (
      <g className="av-brows">
        <path d="M43 47 L53 50" {...common} />
        <path d="M77 47 L67 50" {...common} />
      </g>
    );
  if (state === 'thinking')
    return (
      <g className="av-brows">
        <path d="M43 49 L53 48" {...common} />
        <path d="M67 45 Q72 43 77 45" {...common} />
      </g>
    );
  if (state === 'pleased' || state === 'speaking')
    return (
      <g className="av-brows">
        <path d="M43 47 Q48 44 53 47" {...common} />
        <path d="M67 47 Q72 44 77 47" {...common} />
      </g>
    );
  return (
    <g className="av-brows">
      <path d="M43 48 Q48 46 53 48" {...common} />
      <path d="M67 48 Q72 46 77 48" {...common} />
    </g>
  );
}

function Eyes({ state }: { state: AvatarState }) {
  if (state === 'pleased')
    return (
      <g className="av-eyes">
        <path d="M44 58 Q48 54 52 58" fill="none" stroke="#1F1720" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M68 58 Q72 54 76 58" fill="none" stroke="#1F1720" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    );
  const dx = state === 'thinking' ? 2 : 0;
  const dy = state === 'thinking' ? -2 : 0;
  return (
    <g className="av-eyes">
      <ellipse cx={48 + dx} cy={57 + dy} rx="3.2" ry="3.8" fill="#1F1720" />
      <ellipse cx={72 + dx} cy={57 + dy} rx="3.2" ry="3.8" fill="#1F1720" />
      <circle cx={49 + dx} cy={55.5 + dy} r="1" fill="#fff" />
      <circle cx={73 + dx} cy={55.5 + dy} r="1" fill="#fff" />
    </g>
  );
}

/** Per-agent hair (back layer + front layer) and accessories so the three read as distinct characters. */
function HairBack({ agent }: { agent: AgentId }) {
  if (agent === 'maya')
    return <path d="M30 58 Q28 22 60 20 Q92 22 90 58 L92 92 Q80 98 74 88 L46 88 Q40 98 28 92 Z" fill={HAIR.maya} />;
  return null;
}

function HairFront({ agent }: { agent: AgentId }) {
  if (agent === 'maya')
    return (
      <g>
        <path d="M34 50 Q36 24 60 24 Q86 24 86 50 Q74 34 58 36 Q44 38 34 50 Z" fill={HAIR.maya} />
        <circle cx="60" cy="16" r="10" fill={HAIR.maya} />
      </g>
    );
  if (agent === 'alex')
    return (
      <path
        d="M34 48 L36 30 L44 34 L46 22 L54 30 L60 18 L66 30 L74 22 L76 34 L84 30 L86 48 Q74 36 60 38 Q46 36 34 48 Z"
        fill={HAIR.alex}
      />
    );
  return <path d="M35 46 Q36 26 60 25 Q84 26 85 46 Q80 36 60 35 Q40 36 35 46 Z" fill={HAIR.jordan} />;
}

function Accessory({ agent }: { agent: AgentId }) {
  if (agent === 'alex')
    return (
      <g className="av-glasses" fill="none" stroke="#0F172A" strokeWidth="2.2">
        <rect x="39" y="50" width="18" height="14" rx="4" fill="rgba(34,211,238,0.12)" />
        <rect x="63" y="50" width="18" height="14" rx="4" fill="rgba(34,211,238,0.12)" />
        <path d="M57 56 L63 56" />
      </g>
    );
  if (agent === 'jordan')
    return (
      <g>
        <path d="M44 74 Q60 92 76 74 Q74 88 60 90 Q46 88 44 74 Z" fill={HAIR.jordan} />
        <path d="M33 54 Q33 24 60 24 Q87 24 87 54" fill="none" stroke="#334155" strokeWidth="3" />
        <rect x="28" y="50" width="8" height="14" rx="3" fill="#334155" />
        <path d="M32 64 Q34 76 46 76" fill="none" stroke="#334155" strokeWidth="2" />
        <circle cx="47" cy="76" r="2.5" fill="#FBBF24" />
      </g>
    );
  return (
    <g>
      <circle cx="35" cy="66" r="2.5" fill="#E9D5FF" />
      <circle cx="85" cy="66" r="2.5" fill="#E9D5FF" />
    </g>
  );
}

function Outfit({ agent }: { agent: AgentId }) {
  const c = OUTFIT[agent];
  return (
    <g>
      <path d="M18 140 Q20 104 60 100 Q100 104 102 140 Z" fill={c.main} />
      {agent === 'maya' && <path d="M48 101 L60 116 L72 101" fill="none" stroke="#F5F3FF" strokeWidth="3" strokeLinejoin="round" />}
      {agent === 'alex' && (
        <g>
          <path d="M50 101 Q60 110 70 101" fill="none" stroke={c.dark} strokeWidth="3" />
          <path d="M42 106 L42 140 M78 106 L78 140" stroke={c.dark} strokeWidth="2" />
        </g>
      )}
      {agent === 'jordan' && (
        <g>
          <path d="M46 101 L60 140 L74 101" fill={c.dark} />
          <rect x="70" y="114" width="18" height="22" rx="2" fill="#F8FAFC" transform="rotate(-8 79 125)" />
          <path d="M74 120 L84 119 M74 125 L84 124 M74 130 L81 129" stroke="#94A3B8" strokeWidth="1.5" transform="rotate(-8 79 125)" />
        </g>
      )}
    </g>
  );
}

export function Avatar({ agent, state = 'idle', name, showLabel = true, size = 140 }: AvatarProps) {
  const meta = AGENTS[agent];
  const label = name ?? meta.name;
  return (
    <figure
      className={`av av--${agent} av--${state}`}
      style={{ ['--av-color' as string]: meta.color, width: size }}
      aria-label={`${label}, ${meta.role}, ${state}`}
    >
      <div className="av-stage">
        <div className="av-glow" />
        <svg className="av-svg" viewBox="0 0 120 140" width={size} height={(size * 140) / 120} role="img">
          <g className="av-body">
            <HairBack agent={agent} />
            <Outfit agent={agent} />
            <rect x="52" y="86" width="16" height="16" rx="4" fill={SKIN[agent]} />
            <g className="av-head">
              <ellipse cx="60" cy="58" rx="26" ry="29" fill={SKIN[agent]} />
              <ellipse cx="34" cy="60" rx="4" ry="6" fill={SKIN[agent]} />
              <ellipse cx="86" cy="60" rx="4" ry="6" fill={SKIN[agent]} />
              <HairFront agent={agent} />
              <Brows state={state} color={HAIR[agent]} />
              <Eyes state={state} />
              {(state === 'pleased' || state === 'speaking') && (
                <g opacity="0.35">
                  <ellipse cx="42" cy="67" rx="4" ry="2.5" fill="#F43F5E" />
                  <ellipse cx="78" cy="67" rx="4" ry="2.5" fill="#F43F5E" />
                </g>
              )}
              <Mouth state={state} />
              <Accessory agent={agent} />
            </g>
          </g>
        </svg>
        {state === 'thinking' && (
          <div className="av-thinking" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        )}
        {state === 'concerned' && <div className="av-sweat" aria-hidden />}
      </div>
      {showLabel && (
        <figcaption className="av-label">
          <span className="av-name">{label}</span>
          <span className="av-role">{meta.role}</span>
        </figcaption>
      )}
    </figure>
  );
}

export default Avatar;
