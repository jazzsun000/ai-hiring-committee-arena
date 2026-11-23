/* @bruin
name: marts.answer_scores
type: duckdb.sql
connection: duckdb-default
materialization:
  type: table
depends:
  - raw.interview_events
columns:
  - name: session_id
    type: varchar
    checks:
      - name: not_null
  - name: round
    type: integer
    checks:
      - name: not_null
  - name: agent
    type: varchar
    description: Assessing interviewer
    checks:
      - name: not_null
      - name: accepted_values
        value: ['maya', 'alex', 'jordan']
  - name: topic
    type: varchar
    checks:
      - name: not_null
  - name: difficulty
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: ['easy', 'medium', 'hard']
  - name: score
    type: double
    description: Assessment score on a 1-5 scale
    checks:
      - name: not_null
      - name: non_negative
  - name: reason
    type: varchar
  - name: evidence
    type: varchar
  - name: ts
    type: timestamp
custom_checks:
  - name: answer_scores is not empty
    query: SELECT COUNT(*) > 0 FROM marts.answer_scores
    value: 1
    blocking: true
@bruin */

SELECT
    session_id,
    round,
    agent,
    topic,
    difficulty,
    score,
    reason,
    text AS evidence,
    ts
FROM raw.interview_events
WHERE type = 'assessment'
