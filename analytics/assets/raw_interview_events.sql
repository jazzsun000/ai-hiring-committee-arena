/* @bruin
name: raw.interview_events
type: duckdb.sql
connection: duckdb-default
materialization:
  type: table
columns:
  - name: session_id
    type: varchar
    description: Interview session id. Synthetic seed rows are prefixed synthetic-.
    checks:
      - name: not_null
  - name: ts
    type: timestamp
    description: Event timestamp
    checks:
      - name: not_null
  - name: round
    type: integer
    description: Interview round number
    checks:
      - name: not_null
  - name: type
    type: varchar
    description: Event type
    checks:
      - name: not_null
      - name: accepted_values
        value: ['question', 'answer', 'assessment', 'decision', 'scorecard']
  - name: agent
    type: varchar
    description: Actor for the event (maya, alex, jordan, candidate, or system)
    checks:
      - name: not_null
      - name: accepted_values
        value: ['maya', 'alex', 'jordan', 'candidate', 'system']
  - name: topic
    type: varchar
  - name: difficulty
    type: varchar
  - name: score
    type: double
  - name: reason
    type: varchar
  - name: text
    type: varchar
  - name: source_file
    type: varchar
    description: Path of the JSONL file the row was ingested from
    checks:
      - name: not_null
custom_checks:
  - name: raw events table is not empty
    description: Ingest must load seed events and any app events.jsonl
    query: SELECT COUNT(*) > 0 FROM raw.interview_events
    value: 1
    blocking: true
@bruin */

-- Reads seed_events.jsonl always, plus events.jsonl when the app has written it.
-- The *events.jsonl glob matches both filenames. Bruin's DuckDB ADBC driver
-- does not provide file_exists(), so a glob is used instead of a conditional list.
SELECT
    session_id,
    CAST(ts AS TIMESTAMP) AS ts,
    CAST(round AS INTEGER) AS round,
    type,
    agent,
    topic,
    difficulty,
    CAST(score AS DOUBLE) AS score,
    reason,
    text,
    filename AS source_file
FROM read_json_auto(
    '/workspace/ai-hiring-arena/analytics/data/*events.jsonl',
    format = 'newline_delimited',
    union_by_name = true,
    filename = true,
    columns = {
        'session_id': 'VARCHAR',
        'ts': 'VARCHAR',
        'round': 'INTEGER',
        'type': 'VARCHAR',
        'agent': 'VARCHAR',
        'topic': 'VARCHAR',
        'difficulty': 'VARCHAR',
        'score': 'DOUBLE',
        'reason': 'VARCHAR',
        'text': 'VARCHAR'
    }
)
