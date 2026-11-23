# AI Hiring Committee Arena — evaluation analytics (Bruin + DuckDB)

This is a real Bruin pipeline. It ingests interview events into DuckDB and builds
four marts used to evaluate candidate performance and interviewer adaptivity.

No secrets are stored in this folder. The DuckDB connection is a local file:

`/workspace/ai-hiring-arena/analytics/arena.duckdb`

## What it does

1. **Ingest** (`raw.interview_events`): load `data/seed_events.jsonl` always,
   plus `data/events.jsonl` when the app has written real session events.
2. **answer_scores**: one row per interviewer assessment (round, agent, topic,
   difficulty, score, reason).
3. **agent_decisions**: one row per agent decision (agent, decision, reason).
4. **session_trend**: average score per round, difficulty progression, and
   **adaptivity** = whether difficulty rose after a high prior-round score
   (average >= 3.5, the same raise threshold the app uses).
5. **candidate_summary**: per-session overall score, recommendation, topics,
   difficulty path, and whether adaptivity fired.

Quality checks (`not_null`, `accepted_values`, plus non-empty custom checks)
run as part of `bruin run`.

## Seed vs app events

`data/seed_events.jsonl` is **SYNTHETIC** sample data. Every `session_id` is
prefixed `synthetic-`. It is used so the pipeline can be validated and run
before the app writes `data/events.jsonl`. When that file appears, ingest
unions it with the seed (no need to delete the seed).

## Prerequisites

- Bruin CLI (official installer):

  ```bash
  curl -LsSf https://getbruin.com/install/cli | sh
  export PATH="$PATH:$HOME/.local/bin"
  bruin version
  ```

- DuckDB Python package and/or CLI (optional for querying, required for local
  inspection). Bruin talks to DuckDB on its own during `bruin run`.

  ```bash
  pip install duckdb
  # optional CLI, Linux x86_64 example (match a current DuckDB release):
  # curl -sL https://github.com/duckdb/duckdb/releases/download/v2.0.1/duckdb-cli-linux-amd64.tar.gz | tar -xz -C "$HOME/.local/bin"
  ```

## Exact rerun commands

From this directory (`analytics/`):

```bash
export PATH="$PATH:$HOME/.local/bin"
cd /workspace/ai-hiring-arena/analytics

# 1) Validate the pipeline
bruin validate /workspace/ai-hiring-arena/analytics \
  --config-file /workspace/ai-hiring-arena/analytics/.bruin.yml

# 2) Run ingest + marts + quality checks, rebuilding tables
bruin run /workspace/ai-hiring-arena/analytics \
  --config-file /workspace/ai-hiring-arena/analytics/.bruin.yml \
  --full-refresh

# 3) Query a mart (CSV or plain)
bruin query \
  --config-file /workspace/ai-hiring-arena/analytics/.bruin.yml \
  --connection duckdb-default \
  --output csv \
  --query "SELECT * FROM marts.candidate_summary"
```

Or run the wrapper that also writes logs and query outputs under `evidence/`:

```bash
cd /workspace/ai-hiring-arena/analytics
./run_pipeline.sh
```

Evidence produced by the wrapper:

- `evidence/versions.txt`
- `evidence/bruin_validate.log`
- `evidence/bruin_run.log`
- `evidence/mart_row_counts.txt`
- `evidence/{raw_interview_events,answer_scores,agent_decisions,session_trend,candidate_summary}.{csv,txt}`


## Git requirement

Bruin CLI requires a Git repository at or above this folder (`failed to find repo`
otherwise). This directory contains a local `.git` created only so `bruin validate`
and `bruin run` work before the app root is a repo. If `/workspace/ai-hiring-arena`
is later initialized as the project Git repo, remove `analytics/.git` to avoid a
nested repository, and keep using `--config-file analytics/.bruin.yml` (or move
`.bruin.yml` to the new repo root if you prefer Bruin's default discovery).

## Connection

`.bruin.yml` points the `duckdb-default` connection at
`/workspace/ai-hiring-arena/analytics/arena.duckdb`. If you clone the repo
somewhere else, update that path (and the absolute JSONL paths in
`assets/raw_interview_events.sql`) before running.
