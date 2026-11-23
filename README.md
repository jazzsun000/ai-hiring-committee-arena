# AI Hiring Committee Arena

Three AI interviewers run an adaptive data-science interview:

- **Maya** (Hiring Manager): product sense, metrics, A/B testing
- **Alex** (Technical): stats, SQL, causal inference
- **Jordan** (Evaluator): merges Maya's and Alex's independent scores, picks the next asker, topic and difficulty (harder after a strong answer, easier/probing after a weak one), and writes the final scorecard, which quotes the candidate's own words.

Every agent decision appears in the **decision ledger** with a reason, and every event is appended to `analytics/data/events.jsonl` for the Bruin pipeline.

## Run

```bash
npm install && npm run dev
```

- Frontend (Vite): http://localhost:5173 (proxies `/api` to the backend)
- Backend (Express, `server/`): http://localhost:8787

`npm run build` type-checks and builds the frontend. The backend runs with `npm start`.

## xAI key and modes

The key stays server-side only. It's never sent to the browser or logged.

- The key is resolved **at request time**: a non-empty `XAI_API_KEY` in `server/.env` (gitignored; see `server/.env.example`) takes precedence. Otherwise `process.env.XAI_API_KEY` is used. `server/.env` is re-read on every call, so you can drop in a new key without restarting.
- `GET /api/health` returns `{ mode: "live" | "demo", reason, key_source }`. It re-validates the key with a tiny xAI call whenever the key changes, and at most every 30 s.
- **LIVE (xAI)**: OpenAI-compatible chat completions at `https://api.x.ai/v1`, model `grok-4-fast-non-reasoning` (override with `XAI_MODEL`). Prompts ask for strict JSON. Output is parsed and repaired (code fences, trailing commas), then validated. If any step fails validation, that step falls back to the deterministic scorer. Scorecard quotes are checked to be verbatim, and if there are fewer than 2 verbatim quotes, they're extracted from the answers in code.
- **DEMO MODE (deterministic)**: used when the key is missing or rejected, or when `FORCE_DEMO=1`. Scoring is rule-based (concepts covered per topic, answer length, the interviewer's own lens). Jordan's rules: an average of 3.5 or more raises difficulty and switches interviewer, below 2.5 lowers difficulty and probes the same topic, anything else keeps the level. The UI shows a `DEMO` badge and a "DEMO MODE (deterministic)" banner.

## Flow and API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | mode `live` or `demo` |
| `POST /api/session {company, role}` | starts a session and returns Q1 (Maya, metrics, medium) |
| `POST /api/answer {session_id, answer}` | Maya and Alex score in parallel: `{score 1-5, evidence, gap}` |
| `POST /api/next {session_id}` | Jordan decides the next question, with a reason and a trend of up, down or flat |
| `POST /api/scorecard {session_id}` | final scorecard with a recommendation, per-agent scores and ≥2 verbatim quotes |
| `POST /api/events` | appends a validated event to `analytics/data/events.jsonl` |
| `POST /api/analytics/run {session_id}` | runs `analytics/run_pipeline.sh` (Bruin, 90 s timeout), then returns `marts.session_trend` and `marts.candidate_summary` rows for the session from `analytics/arena.duckdb` (duckdb CLI) |

The default interview is **2 rounds**, followed by the scorecard. **Finish interview** is always visible, and **+1 round** appears after round 2.

## Event schema

One JSON object per line in `analytics/data/events.jsonl` (defined in `/workspace/ai-hiring-arena-pm/PRD.md`):

```json
{"session_id":"uuid","ts":"ISO-8601","round":1,"type":"question|answer|assessment|decision|scorecard","agent":"maya|alex|jordan|candidate|system","topic":"metrics|ab_testing|sql|causal|null","difficulty":"easy|medium|hard|null","score":null,"reason":null,"text":null}
```

The backend logs its own events: question, answer (agent `candidate`), 2 assessments per round, Jordan's decision per question, and the scorecard. Decision events must come from maya, alex or jordan, to match the Bruin checks.

## Tests

```bash
node scripts/e2e-api.mjs [http://localhost:5173]   # strong then weak answer: checks difficulty up, then down/probe, and ≥2 verbatim quotes
node scripts/mock-xai.mjs 8799                      # test-only fake xAI server to exercise the live code path
```

## Ownership

- Designer: `src/components/arena/*` and `src/styles/arena.css`
- PM: `analytics/*`. The app only appends to `analytics/data/events.jsonl` and runs `run_pipeline.sh`.
- Engineer: everything else
