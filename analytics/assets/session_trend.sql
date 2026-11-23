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
    checks:
      - name: not_null
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
    description: 'True when difficulty rose after a prior-round average score >= 3.5 (the app raise threshold).'
    checks:
      - name: not_null
custom_checks:
  - name: session_trend is not empty
    query: SELECT COUNT(*) > 0 FROM marts.session_trend
    value: 1
    blocking: true
@bruin */

WITH round_scores AS (
    SELECT
        session_id,
        round,
        AVG(score) AS avg_score,
        COUNT(*) AS n_assessments
    FROM marts.answer_scores
    GROUP BY 1, 2
),
round_difficulty AS (
    SELECT
        session_id,
        round,
        -- Prefer the question's difficulty; fall back to any non-null difficulty in the round
        COALESCE(
            MAX(CASE WHEN type = 'question' THEN difficulty END),
            MAX(difficulty)
        ) AS difficulty
    FROM raw.interview_events
    GROUP BY 1, 2
),
base AS (
    SELECT
        s.session_id,
        s.round,
        s.avg_score,
        s.n_assessments,
        d.difficulty,
        CASE d.difficulty
            WHEN 'easy' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'hard' THEN 3
        END AS difficulty_rank
    FROM round_scores s
    JOIN round_difficulty d
      ON s.session_id = d.session_id
     AND s.round = d.round
)
SELECT
    session_id,
    round,
    ROUND(avg_score, 2) AS avg_score,
    n_assessments,
    difficulty,
    difficulty_rank,
    LAG(avg_score) OVER (PARTITION BY session_id ORDER BY round) AS prev_avg_score,
    LAG(difficulty) OVER (PARTITION BY session_id ORDER BY round) AS prev_difficulty,
    LAG(difficulty_rank) OVER (PARTITION BY session_id ORDER BY round) AS prev_difficulty_rank,
    COALESCE(
        difficulty_rank > LAG(difficulty_rank) OVER (PARTITION BY session_id ORDER BY round),
        FALSE
    ) AS difficulty_rose,
    COALESCE(
        LAG(avg_score) OVER (PARTITION BY session_id ORDER BY round) >= 3.5,
        FALSE
    ) AS prior_round_high_score,
    -- adaptivity = whether difficulty rose after high scores
    COALESCE(
        difficulty_rank > LAG(difficulty_rank) OVER (PARTITION BY session_id ORDER BY round)
        AND LAG(avg_score) OVER (PARTITION BY session_id ORDER BY round) >= 3.5,
        FALSE
    ) AS adaptivity
FROM base
