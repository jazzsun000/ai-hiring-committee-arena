/* @bruin
name: marts.candidate_summary
type: duckdb.sql
connection: duckdb-default
materialization:
  type: table
depends:
  - raw.interview_events
  - marts.answer_scores
  - marts.session_trend
  - marts.agent_decisions
columns:
  - name: session_id
    type: varchar
    checks:
      - name: not_null
  - name: n_rounds
    type: integer
    checks:
      - name: not_null
  - name: n_answers
    type: integer
    checks:
      - name: not_null
  - name: overall_avg_score
    type: double
    checks:
      - name: not_null
  - name: recommendation
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: ['strong_hire', 'hire', 'lean_hire', 'lean_no_hire', 'no_hire']
  - name: adaptivity
    type: boolean
    description: 'True if any later round raised difficulty after a high prior-round score.'
    checks:
      - name: not_null
  - name: start_difficulty
    type: varchar
  - name: end_difficulty
    type: varchar
  - name: topics
    type: varchar
custom_checks:
  - name: candidate_summary is not empty
    query: SELECT COUNT(*) > 0 FROM marts.candidate_summary
    value: 1
    blocking: true
@bruin */

WITH answers AS (
    SELECT session_id, COUNT(*) AS n_answers
    FROM raw.interview_events
    WHERE type = 'answer'
    GROUP BY 1
),
scores AS (
    SELECT
        session_id,
        ROUND(AVG(score), 2) AS overall_avg_score,
        MIN(score) AS min_score,
        MAX(score) AS max_score,
        COUNT(*) AS n_assessments
    FROM marts.answer_scores
    GROUP BY 1
),
scorecards AS (
    SELECT
        session_id,
        score AS scorecard_overall,
        COALESCE(
            regexp_extract(reason, 'Recommendation:\s*([a-z_]+)', 1),
            'no_hire'
        ) AS recommendation,
        reason AS scorecard_reason
    FROM raw.interview_events
    WHERE type = 'scorecard'
    QUALIFY ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY ts DESC) = 1
),
trend AS (
    SELECT
        session_id,
        MAX(round) AS n_rounds,
        BOOL_OR(adaptivity) AS adaptivity,
        arg_min(difficulty, round) AS start_difficulty,
        arg_max(difficulty, round) AS end_difficulty
    FROM marts.session_trend
    GROUP BY 1
),
topics AS (
    SELECT
        session_id,
        string_agg(DISTINCT topic, ', ' ORDER BY topic) AS topics
    FROM raw.interview_events
    WHERE topic IS NOT NULL
    GROUP BY 1
)
SELECT
    s.session_id,
    t.n_rounds,
    COALESCE(a.n_answers, 0) AS n_answers,
    s.n_assessments,
    s.overall_avg_score,
    s.min_score,
    s.max_score,
    sc.scorecard_overall,
    sc.recommendation,
    sc.scorecard_reason,
    t.adaptivity,
    t.start_difficulty,
    t.end_difficulty,
    tp.topics
FROM scores s
LEFT JOIN answers a ON s.session_id = a.session_id
-- Only completed interviews (with a scorecard event); abandoned sessions are excluded so they cannot fail checks.
INNER JOIN scorecards sc ON s.session_id = sc.session_id
LEFT JOIN trend t ON s.session_id = t.session_id
LEFT JOIN topics tp ON s.session_id = tp.session_id
