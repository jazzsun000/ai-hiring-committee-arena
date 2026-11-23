export type AgentId = 'maya' | 'alex' | 'jordan';
export type AvatarState = 'idle' | 'speaking' | 'thinking' | 'pleased' | 'concerned';

export interface AgentMeta {
  id: AgentId;
  name: string;
  role: string;
  color: string;
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  maya: { id: 'maya', name: 'Maya', role: 'Hiring Manager', color: '#A78BFA' },
  alex: { id: 'alex', name: 'Alex', role: 'Technical Interviewer', color: '#22D3EE' },
  jordan: { id: 'jordan', name: 'Jordan', role: 'Evaluator', color: '#FBBF24' },
};

export const AGENT_ORDER: AgentId[] = ['maya', 'alex', 'jordan'];
