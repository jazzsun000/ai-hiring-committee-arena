/* @bruin
name: marts.agent_decisions
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
    checks:
      - name: not_null
      - name: accepted_values
        value: ['maya', 'alex', 'jordan']
  - name: decision
    type: varchar
    description: 'Decision text, typically Next asker: <agent> or a scorecard recommendation'
    checks:
      - name: not_null
  - name: reason
    type: varchar
    checks:
      - name: not_null
  - name: topic
    type: varchar
  - name: difficulty
    type: varchar
  - name: ts
    type: timestamp
    checks:
      - name: not_null
custom_checks:
  - name: agent_decisions is not empty
    query: SELECT COUNT(*) > 0 FROM marts.agent_decisions
    value: 1
    blocking: true
@bruin */

SELECT
    session_id,
    round,
    agent,
    COALESCE(text, reason) AS decision,
    reason,
    topic,
    difficulty,
    ts
FROM raw.interview_events
WHERE type = 'decision'
