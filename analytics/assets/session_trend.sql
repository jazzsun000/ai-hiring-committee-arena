/* @bruin
name: marts.session_trend
type: duckdb.sql
connection: duckdb-default
materialization:
  type: table
depends:
  - raw.interview_events
  - marts.answer_scores
columns:
  - name: session_id
    type: varchar
    checks:
      - name: not_null
  - name: round
    type: integer
    checks:
      - name: not_null
  - name: avg_score
    type: double
    description: 'Mean Maya/Alex score for the round; NULL for a round whose question was asked but not answered (e.g. +1 round then Finish).'
  - name: difficulty
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: ['easy', 'medium', 'hard']
  - name: difficulty_rank
    type: integer
    checks:
      - name: not_null
  - name: prev_avg_score
    type: double
  - name: prev_difficulty
    type: varchar
  - name: difficulty_rose
    type: boolean
    checks:
      - name: not_null
  - name: prior_round_high_score
    type: boolean
    checks:
      - name: not_null
  - name: adaptivity
    type: boolean
    description: 'Per-transition adaptivity (round > 1): (prev avg >= 3.5 AND difficulty up) OR (prev avg <= 2.5 AND difficulty down) OR (2.5 < prev avg < 3.5 AND difficulty same). FALSE for round 1.'
    checks:
      - name: not_null
custom_checks:
  - name: session_trend is not empty
    query: SELECT COUNT(*) > 0 FROM marts.session_trend
    value: 1
    blocking: true
@bruin */

WITH round_scores AS (
    SELECT session_id, round, AVG(score) AS avg_score, COUNT(*) AS n_assessments
    FROM marts.answer_scores
    GROUP BY 1, 2
),
round_difficulty AS (
    SELECT
        session_id,
        round,
        COALESCE(MAX(CASE WHEN type = 'question' THEN difficulty END), MAX(difficulty)) AS difficulty
    FROM raw.interview_events
    WHERE round IS NOT NULL
    GROUP BY 1, 2
),
base AS (
    -- Every round that had a question (including an unanswered +1 round), so every transition is counted.
    SELECT
        d.session_id,
        d.round,
        s.avg_score,
        COALESCE(s.n_assessments, 0) AS n_assessments,
        d.difficulty,
        CASE d.difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 END AS difficulty_rank
    FROM round_difficulty d
    LEFT JOIN round_scores s
      ON s.session_id = d.session_id AND s.round = d.round
    WHERE d.difficulty IS NOT NULL
),
lagged AS (
    SELECT
        *,
        LAG(avg_score) OVER (PARTITION BY session_id ORDER BY round) AS prev_avg_score,
        LAG(difficulty) OVER (PARTITION BY session_id ORDER BY round) AS prev_difficulty,
        LAG(difficulty_rank) OVER (PARTITION BY session_id ORDER BY round) AS prev_difficulty_rank
    FROM base
)
SELECT
    session_id,
    round,
    ROUND(avg_score, 2) AS avg_score,
    n_assessments,
    difficulty,
    difficulty_rank,
    prev_avg_score,
    prev_difficulty,
    prev_difficulty_rank,
    COALESCE(difficulty_rank > prev_difficulty_rank, FALSE) AS difficulty_rose,
    COALESCE(prev_avg_score >= 3.5, FALSE) AS prior_round_high_score,
    COALESCE(
        (prev_avg_score >= 3.5 AND difficulty_rank > prev_difficulty_rank)
        OR (prev_avg_score <= 2.5 AND difficulty_rank < prev_difficulty_rank)
        OR (prev_avg_score > 2.5 AND prev_avg_score < 3.5 AND difficulty_rank = prev_difficulty_rank),
        FALSE
    ) AS adaptivity
FROM lagged
