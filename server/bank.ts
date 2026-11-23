export type AgentId = 'maya' | 'alex' | 'jordan';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Topic {
  id: string;
  owner: 'maya' | 'alex';
  label: string;
  concepts: { name: string; keywords: string[] }[];
  questions: Record<Difficulty, string>;
}

export const TOPICS: Topic[] = [
  {
    id: 'metrics', owner: 'maya', label: 'Product metrics',
    concepts: [
      { name: 'north-star / primary metric', keywords: ['north star', 'primary metric', 'success metric', 'kpi', 'retention', 'engagement', 'conversion', 'dau', 'mau'] },
      { name: 'guardrail metrics', keywords: ['guardrail', 'counter metric', 'trade-off', 'tradeoff', 'cannibal'] },
      { name: 'segmentation', keywords: ['segment', 'cohort', 'new users', 'power users', 'platform', 'region'] },
      { name: 'user / business goal', keywords: ['user', 'customer', 'goal', 'revenue', 'value', 'mission'] },
    ],
    questions: {
      easy: 'What single metric would you use to tell if {company} users are getting value from the product, and why?',
      medium: 'Our new onboarding flow at {company} just launched. How would you measure whether it worked?',
      hard: 'Design a metric framework (north star, inputs, guardrails) for a {company} feature that increases engagement but might hurt long-term retention.',
    },
  },
  {
    id: 'ab_testing', owner: 'maya', label: 'A/B testing',
    concepts: [
      { name: 'hypothesis & primary metric', keywords: ['hypothesis', 'primary metric', 'success metric', 'null'] },
      { name: 'randomization unit', keywords: ['random', 'unit', 'user-level', 'user level', 'bucket', 'assign'] },
      { name: 'power / sample size', keywords: ['power', 'sample size', 'mde', 'minimum detectable', 'duration', 'variance'] },
      { name: 'significance / pitfalls', keywords: ['p-value', 'p value', 'significan', 'confidence interval', 'peeking', 'novelty', 'multiple testing', 'srm'] },
    ],
    questions: {
      easy: 'How would you set up a simple A/B test for a new checkout button at {company}?',
      medium: 'Your A/B test at {company} shows +3% conversion with p = 0.04 after 3 days. Would you ship? What would you check?',
      hard: 'At {company} users interact with each other, so treatment can spill over to control. How would you design an experiment that handles network effects?',
    },
  },
  {
    id: 'sql', owner: 'alex', label: 'SQL',
    concepts: [
      { name: 'joins', keywords: ['join', 'left join', 'inner join'] },
      { name: 'aggregation', keywords: ['group by', 'count', 'sum', 'avg', 'having'] },
      { name: 'window functions', keywords: ['window', 'over (', 'over(', 'partition by', 'row_number', 'rank', 'lag', 'lead'] },
      { name: 'filters / edge cases', keywords: ['where', 'null', 'distinct', 'duplicate', 'date'] },
    ],
    questions: {
      easy: 'Write SQL (or describe it) to count daily active users from an events(user_id, event_time) table.',
      medium: 'Given orders(user_id, order_id, created_at), how would you compute each user\'s 7-day repeat-purchase rate in SQL?',
      hard: 'Using window functions, compute week-over-week retention cohorts from events(user_id, event_time). Explain edge cases.',
    },
  },
  {
    id: 'causal', owner: 'alex', label: 'Stats & causal inference',
    concepts: [
      { name: 'confounding', keywords: ['confound', 'selection bias', 'bias', 'observational', 'correlation'] },
      { name: 'identification strategy', keywords: ['difference-in-differences', 'diff-in-diff', 'did', 'instrument', 'regression discontinuity', 'matching', 'propensity', 'synthetic control'] },
      { name: 'assumptions', keywords: ['parallel trends', 'assumption', 'exogenous', 'overlap', 'unconfounded', 'sutva'] },
      { name: 'uncertainty', keywords: ['confidence interval', 'standard error', 'variance', 'p-value', 'robust', 'sensitivity'] },
    ],
    questions: {
      easy: 'What is the difference between correlation and causation? Give an example from {company}.',
      medium: 'We can\'t randomize a pricing change at {company}. How would you estimate its impact?',
      hard: '{company} rolled out a pricing change city by city over 3 months, with no randomization. How would you estimate its causal impact, and what can go wrong with a two-way fixed-effects DiD?',
    },
  },
];

export const topicById = (id: string) => TOPICS.find((t) => t.id === id) ?? TOPICS[0];
