# AI Hiring Committee Arena

Three AI interviewers run an adaptive data-science interview:

- **Maya** (Hiring Manager): product sense, metrics, A/B testing
- **Alex** (Technical): stats, SQL, causal inference
- **Jordan** (Evaluator): merges Maya's and Alex's independent scores, picks the next asker, topic and difficulty (harder after a strong answer, easier/probing after a weak one), and writes the final scorecard, which quotes the candidate's own words.

Every agent decision appears in the **decision ledger** with a reason, and every event is appended to `analytics/data/events.jsonl` for the Bruin pipeline.

## Run (copy-paste)

Prerequisites:
- Node.js 20+ and npm (tested on Node 24.22, npm 11.21).
- For the analytics pipeline: the Bruin CLI and DuckDB CLI in `~/.local/bin`. Install Bruin with `curl -LsSf https://getbruin.com/install/cli | sh`.
- First run: `cp analytics/.bruin.yml.example analytics/.bruin.yml` (then `cd analytics && PATH=$PATH:$HOME/.local/bin ./run_pipeline.sh`).
- `analytics/.bruin.yml` is gitignored by `analytics/.gitignore`, so a fresh clone needs it recreated. See `analytics/README.md`.

```bash
cd /workspace/ai-hiring-arena
npm install

# optional: provider/context keys (server/.env is gitignored; re-read on every request)
cp server/.env.example server/.env
#   then edit server/.env: LLM_PROVIDER=runware, RUNWARE_API_KEY=..., TELEM_API_KEY=...

npm run dev
```

- App: http://localhost:5173. Vite proxies `/api` to the backend.
- API: http://localhost:8787. Check it with `curl -s localhost:8787/api/health`.
- `npm run build` type-checks and builds the frontend. `npm start` runs only the API.

## Public LIVE app (LingCode Cloud)

**https://ai-hiring-arena-4eba89b2.apps.lingcode.app/** is the full-stack LIVE app: Express plus the built React UI, with Runware `openai:gpt@5` agents and Telem retrieval. It runs on LingCode Cloud's **hosted-apps tier** (Node container, Pro plan) and was deployed with `npx lingcode ship --server` (`scripts/deploy-lingcode.sh`) on 2026-11-23 at 3:44 PM PT.

- The keys are stored in the LingCode backend secrets vault and passed to the server as environment variables: `RUNWARE_API_KEY`, `TELEM_API_KEY`, `LLM_PROVIDER=runware` and `RUNWARE_MODEL=openai:gpt@5`. They are not in the repo, the upload or the browser bundle.
- **Bruin does not run on this host.** The Bruin CLI is 164 MB, and hosted-app uploads are capped at 5 MiB per file. DuckDB is also absent. The Bruin panel says "not available on this host". Bruin is VERIFIED from the repo run (`analytics/evidence/bruin_run.log`), not from live execution on LingCode.
- **Storage:** the app directory is read-only, so events go to `/tmp/arena-data/events.jsonl`, which is ephemeral and reset on redeploy.
- **Evidence:** [deploy log](analytics/evidence/lingcode_deploy_20261123-154326.log), [public API e2e](analytics/evidence/lingcode_public_e2e_20261123-154409.log), [public UI e2e](analytics/evidence/lingcode_deploy.md).

## Public static demo (GitHub Pages)

GitHub Pages can only host a static site, so this is a clearly labeled **DEMO**, not the LIVE interview:

**https://jazzsun000.github.io/ai-hiring-committee-arena/**

It runs entirely in the browser with deterministic scoring and a recorded Telem sources snapshot (Stripe · Product Data Scientist, 2026-11-23). There are no API keys in the bundle. The banner reads: "Static demo: deterministic scoring, recorded Telem sources. LIVE version runs agents on Runware."

The normal `npm run dev` LIVE/DEMO path is unchanged. To rebuild the Pages site locally:

```bash
npm run build:pages
npx vite preview --base /ai-hiring-committee-arena/
```

Then open http://127.0.0.1:4173/ai-hiring-committee-arena/. `build:pages` sets `VITE_STATIC_DEMO=1` and `base: /ai-hiring-committee-arena/`.


Tests (with `npm run dev` running):

```bash
# API e2e: strong then weak answer -> difficulty up, then down/probe, no repeated question, >=2 verbatim quotes
node scripts/e2e-api.mjs http://localhost:5173

# Same flow against the mock LLM (exercises the Runware code path; badge stays DEMO by design)
node scripts/mock-llm.mjs 8799 &
LLM_PROVIDER=runware RUNWARE_API_KEY=test RUNWARE_BASE_URL=http://localhost:8799/v1 PORT=8789 npx tsx server/index.ts &
node scripts/e2e-api.mjs http://localhost:8789

# UI e2e (Playwright with system Chrome; needs playwright-core installed, e.g. in /workspace/arena-e2e)
PLUS_ONE=1 node scripts/e2e-ui.mjs http://localhost:5173 demo

# Secret scan of the tree + git history
./scripts/secret-scan.sh
```

Bruin pipeline:

```bash
cd analytics && PATH=$PATH:$HOME/.local/bin ./run_pipeline.sh   # writes analytics/evidence/*
```

## Sponsor integration status

| Sponsor | Status | Evidence |
|---|---|---|
| Bruin | **VERIFIED**. `run_pipeline.sh` exits 0 (5 assets, 45 checks). The scorecard's Bruin panel reads `marts.session_trend` and `marts.candidate_summary` | [analytics/evidence/bruin_run.log](analytics/evidence/bruin_run.log), [mart_row_counts.txt](analytics/evidence/mart_row_counts.txt) |
| Telem | **VERIFIED**. A real end-to-end call through the app on 2026-11-23 returned 8 sources; they render as links and the top snippet grounds Q1 | [analytics/evidence/telem_call.md](analytics/evidence/telem_call.md), [telem_module_test.txt](analytics/evidence/telem_module_test.txt), screenshot `/workspace/ai-hiring-arena-shots/loop2-telem-sources.png` (outside the repo) |
| Runware (LLM) | **VERIFIED** (real calls, 12:35 PM PT Nov 23). Model `openai:gpt@5` via `RUNWARE_MODEL`: full live e2e with 7/7 LLM steps succeeding and 0 fallbacks. Measured: Maya+Alex in parallel 1.6–3.1 s per round, Jordan 2.2–2.3 s, scorecard 3.0 s, about 3.9–5.3 s per round. The default `minimax:m3@0` returns HTTP 200 but is a thinking model: 6–10 s on a tiny prompt and over 45 s on the real prompts, so every step timed out and fell back | [runware_call_openai_gpt5](analytics/evidence/runware_call_openai_gpt5.md), [runware_call_minimax_m3](analytics/evidence/runware_call_minimax_m3.md), `/workspace/ai-hiring-arena-shots/loop3-live-*` |
| LingCode Cloud | **VERIFIED** (hosted-apps tier, 2026-11-23 3:44 PM PT). The full-stack app was deployed with `lingcode ship --server`, and secrets are in the LingCode vault. The public e2e test passed in LIVE mode: 8 Telem sources, a strong answer moved difficulty up to hard, a weak answer moved it down to easy, and the scorecard quoted the answers verbatim | [analytics/evidence/lingcode_deploy.md](analytics/evidence/lingcode_deploy.md) |
| BAND | NOT IMPLEMENTED | none |
| Glasser | NOT IMPLEMENTED | none |

## LLM provider and modes

Provider keys stay server-side. They're never sent to the browser or logged. All settings are read **at request time** from the gitignored `server/.env`, which wins over the process environment, so no restart is needed. See `server/.env.example`.

| Setting | Meaning |
|---|---|
| `LLM_PROVIDER` | `demo` (the default, used when unset) or `runware` |
| `RUNWARE_API_KEY` | Runware key. If `LLM_PROVIDER=runware` and this is empty, the app stays in demo |
| `RUNWARE_MODEL` | Runware AIR model id. The code default is `minimax:m3@0`, but use `openai:gpt@5` (verified fast). `openai:*` models are sent `max_completion_tokens` and `reasoning_effort: minimal` |
| `LLM_TIMEOUT_MS` | Per-call timeout, default 45000 |
| `RUNWARE_BASE_URL` | **Tests only.** Points the provider at `scripts/mock-llm.mjs`. Calls to an override URL never switch the badge to LIVE |
| `TELEM_API_KEY` | Used by `server/telem.ts` for role-context retrieval |

- **DEMO** (default): the deterministic rule-based scorer (concepts covered per topic, answer length, the interviewer's own lens). Jordan's rules: an average of 3.5 or more raises difficulty and switches interviewer, below 2.5 lowers difficulty and probes, anything else keeps the level. Questions already asked in the session (by topic:difficulty id) are never repeated. The banner reads "DEMO MODE · deterministic rule-based scorer (no live LLM call)". Provider errors go to the server and browser console only.
- **Runware**: OpenAI-compatible `POST https://api.runware.ai/v1/chat/completions` with `Authorization: Bearer $RUNWARE_API_KEY` ([docs](https://runware.ai/docs/tools/compatible-apis)).
  - Prompts ask for strict JSON. Output is repaired (`<think>` blocks, code fences, trailing commas) and validated, and any step that fails falls back to the deterministic scorer.
  - Jordan's prompt includes the Telem snippets and all prior question texts. Near-duplicate questions are rejected.
  - Scorecard quotes must be verbatim. If fewer than 2 are, they're extracted from the answers in code.
  - The header shows **LIVE · Runware** only after a real call to api.runware.ai succeeds. `/api/health` reports `last_real_success_at`.
- xAI was removed on purpose (product decision), and no xAI calls are made.

## Telem role context

At interview start the server calls `retrieveRoleContext(company, role)` from `server/telem.ts`, owned by the PM helper.
- The module is loaded with a dynamic import, only if the file exists, with a 5 s timeout. On any failure the interview continues without context.
- Only http/https sources are kept. The best sentence from the top snippet is put into the opening question, trimmed at a word boundary.
- The retrieval is logged as a `decision` event by `jordan` with reason `context retrieved from Telem: N sources`.
- Sources appear as clickable links in the Designer's `SourcesPanel`, under the decision ledger.

## Flow and API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | `mode` (`live` only after a real provider call succeeded), `provider`, `endpoint`, `llm_active`, `last_real_success_at`, Telem status |
| `POST /api/session {company, role}` | retrieves Telem context, starts a session and returns Q1 (Maya, metrics, medium, grounded in the top snippet) plus `context.sources` |
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

## Ownership

- Designer: `src/components/arena/*` and `src/styles/arena.css`
- PM: `analytics/*`. The app only appends to `analytics/data/events.jsonl` and runs `run_pipeline.sh`.
- Engineer: everything else

## Demo script (Stripe · Data Scientist)

Pick **Stripe** / **Data Scientist**. The opening question cites the Telem-retrieved Stripe listing.

**Round 1 (strong answer → expect ↑ Harder):**

> I'd make time-to-first-payout the north-star metric, since a merchant only gets value from Stripe once money lands in their bank account, and track KYC completion rate as the leading input metric for the new onboarding flow. I'd run a randomized A/B test at the account level with a power calculation up front: with a ~40% baseline KYC completion rate and a 2-point minimum detectable effect, that's roughly 9-10k accounts per arm. I'd use CUPED with pre-signup traffic as the covariate to cut variance, run an SRM check on the assignment split before reading any results, and hold guardrail metrics on fraud/dispute rate, support tickets per new account and payment failure rate. I'd also segment by country, because KYC requirements differ.

**Round 2 (weak answer → expect ↓ Easier / probing):**

> I'd just compare revenue before and after the change.

Then press **+1 round** to see the easier probe, or **Finish interview** for the scorecard and the Bruin panel. Adaptivity is computed per round transition: (avg ≥ 3.5 and harder) OR (avg ≤ 2.5 and easier) OR (in between and same level). A session counts as adaptive when at least half of its transitions adapted.
