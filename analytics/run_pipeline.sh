#!/usr/bin/env bash
# Run the AI Hiring Committee Arena Bruin + DuckDB evaluation pipeline
# and write evidence under analytics/evidence/.
set -euo pipefail

export PATH="${PATH}:${HOME}/.local/bin"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

CONFIG="${ROOT}/.bruin.yml"
EVIDENCE="${ROOT}/evidence"
mkdir -p "$EVIDENCE" "$ROOT/data"

if ! command -v bruin >/dev/null 2>&1; then
  echo "Bruin CLI not found. Install with:" >&2
  echo "  curl -LsSf https://getbruin.com/install/cli | sh" >&2
  echo "  export PATH=\"\$PATH:\$HOME/.local/bin\"" >&2
  exit 1
fi

{
  echo "recorded_at_pt=$(TZ=America/Los_Angeles date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "bruin_version=$(bruin version 2>/dev/null | awk '/Current:/{print $2}')"
  bruin version 2>/dev/null | sed 's/^/bruin_version_raw: /'
  if command -v duckdb >/dev/null 2>&1; then
    echo "duckdb_cli=$(duckdb --version 2>/dev/null | tail -n 1)"
  else
    echo "duckdb_cli=NOT_INSTALLED"
  fi
  python3 - << 'PY'
import sys
print(f"python={sys.version.split()[0]}")
try:
    import duckdb
    print(f"duckdb_python={duckdb.__version__}")
except Exception as exc:
    print(f"duckdb_python=NOT_INSTALLED ({exc})")
PY
  echo "config_file=${CONFIG}"
  echo "duckdb_path=/workspace/ai-hiring-arena/analytics/arena.duckdb"
  echo "seed_events=${ROOT}/data/seed_events.jsonl"
  if [[ -f "${ROOT}/data/events.jsonl" ]]; then
    echo "app_events=${ROOT}/data/events.jsonl (present)"
  else
    echo "app_events=${ROOT}/data/events.jsonl (missing; ingest will use seed only)"
  fi
} | tee "${EVIDENCE}/versions.txt"

echo "=== bruin validate ==="
bruin validate "$ROOT" --config-file "$CONFIG" 2>&1 | tee "${EVIDENCE}/bruin_validate.log"

echo "=== bruin run --full-refresh ==="
bruin run "$ROOT" --config-file "$CONFIG" --full-refresh --no-color 2>&1 | tee "${EVIDENCE}/bruin_run.log"

query() {
  local name="$1"
  local sql="$2"
  local out="${EVIDENCE}/${name}"
  bruin query --config-file "$CONFIG" --connection duckdb-default --output csv --query "$sql" \
    > "${out}.csv"
  bruin query --config-file "$CONFIG" --connection duckdb-default --output plain --query "$sql" \
    > "${out}.txt"
}

query raw_interview_events "SELECT * FROM raw.interview_events ORDER BY session_id, ts"
query answer_scores "SELECT * FROM marts.answer_scores ORDER BY session_id, round, agent"
query agent_decisions "SELECT * FROM marts.agent_decisions ORDER BY session_id, ts"
query session_trend "SELECT * FROM marts.session_trend ORDER BY session_id, round"
query candidate_summary "SELECT * FROM marts.candidate_summary ORDER BY session_id"

bruin query --config-file "$CONFIG" --connection duckdb-default --output plain --query "
SELECT 'raw.interview_events' AS mart, COUNT(*) AS row_count FROM raw.interview_events
UNION ALL SELECT 'marts.answer_scores', COUNT(*) FROM marts.answer_scores
UNION ALL SELECT 'marts.agent_decisions', COUNT(*) FROM marts.agent_decisions
UNION ALL SELECT 'marts.session_trend', COUNT(*) FROM marts.session_trend
UNION ALL SELECT 'marts.candidate_summary', COUNT(*) FROM marts.candidate_summary
ORDER BY 1
" | tee "${EVIDENCE}/mart_row_counts.txt"

echo "Pipeline finished. Evidence written to ${EVIDENCE}"
