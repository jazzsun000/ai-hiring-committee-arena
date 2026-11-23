import { TOPICS, topicById, type Difficulty, type Topic } from './bank.js';

export interface Assessment {
  agent: 'maya' | 'alex';
  score: number; // 1-5
  evidence: string;
  gap: string;
  source: 'llm' | 'deterministic';
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function hits(text: string, topic: Topic) {
  const lower = text.toLowerCase();
  const covered = topic.concepts.filter((c) => c.keywords.some((k) => lower.includes(k)));
  const missing = topic.concepts.filter((c) => !covered.includes(c));
  return { covered, missing };
}

/** Rule-based scorer: concepts covered + answer length, with a per-lens weighting. */
export function scoreDeterministic(agent: 'maya' | 'alex', answer: string, topicId: string): Assessment {
  const topic = topicById(topicId);
  // Each interviewer also cares about its own lens.
  const lensTopics = TOPICS.filter((t) => t.owner === agent);
  const { covered, missing } = hits(answer, topic);
  const lensHits = lensTopics.reduce((n, t) => n + hits(answer, t).covered.length, 0);
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  let score = 1;
  score += Math.min(2, covered.length * 0.75);
  score += words >= 80 ? 1 : words >= 35 ? 0.6 : words >= 12 ? 0.3 : 0;
  score += Math.min(1, lensHits * 0.25);
  score = Math.max(1, Math.min(5, Math.round(score)));
  if (words < 4) score = 1;
  const allKw = topic.concepts.flatMap((c) => c.keywords);
  const ss = sentences(answer);
  const evidence =
    ss.find((s) => allKw.some((k) => s.toLowerCase().includes(k))) ?? ss[0] ?? '(no answer)';
  const gap = missing.length
    ? `Did not address: ${missing.map((m) => m.name).join(', ')}.`
    : words < 35
      ? 'Covered the concepts but very briefly; needs more depth and concrete numbers.'
      : 'No major gaps; could add a concrete example with numbers.';
  return { agent, score, evidence: evidence.slice(0, 240), gap, source: 'deterministic' };
}

export function nextDifficulty(avg: number, current: Difficulty): Difficulty {
  const order: Difficulty[] = ['easy', 'medium', 'hard'];
  const i = order.indexOf(current);
  if (avg >= 3.5) return order[Math.min(2, i + 1)];
  if (avg < 2.5) return order[Math.max(0, i - 1)];
  return current;
}
