# LingCode Cloud deployment evidence (2026-11-23)

- **Account:** `lingcode whoami` returned jazz.sun000@gmail.com (pro) on https://lingcode.dev
- **Production backend:** 3d7ba2cea6a3fb0811f16ef7
- **App:** ai-hiring-arena (Node runtime, hosted-apps tier)
- **Live URL:** https://ai-hiring-arena-4eba89b2.apps.lingcode.app/
- **Deploy:** `npx lingcode@0.3.0 ship --server --name ai-hiring-arena` from a clean checkout of master 7d029ea. It ran 3:43:34 to 3:44:02 PM PT (building, then running). Log: [lingcode_deploy_20261123-154326.log](lingcode_deploy_20261123-154326.log)
- **Vault secrets** (values never logged): RUNWARE_API_KEY, TELEM_API_KEY, LLM_PROVIDER and RUNWARE_MODEL were each set with PUT /api/cloud/account/backends/<id>/secrets/<KEY> and returned HTTP 200.

## Public end-to-end test (run from the box against the public URL)

Full output: [lingcode_public_e2e_20261123-154409.log](lingcode_public_e2e_20261123-154409.log)

| Check | Result |
|---|---|
| Homepage | PASS: HTTP 200 text/html, JS bundle 200 (173 KB) |
| Three avatars | PASS: Maya, Alex and Jordan rendered in headless Chrome (screenshots `/workspace/ai-hiring-arena-shots/lingcode-*.png`, outside the repo), with 3 thinking avatars while scoring |
| Start interview | PASS: session started in LIVE mode, 8 Telem sources, Q1 grounded in a Stripe listing |
| Submit answers | PASS: 2 rounds |
| AI responses | PASS: 7/7 LLM steps came from Runware openai:gpt@5 with 0 fallbacks. With the README STRONG answer, Maya scored 4 and Alex 5, so Q2 went up to hard; with the WEAK answer both scored 1, so Q3 went down to easy |
| Scorecard | PASS: recommendation and overall score from the LLM, 2 verbatim quotes |
| Sponsor status | PASS (honest): /api/health shows mode=live, provider=runware, telem lastOk=true with 8 sources, and bruin_on_host=false. /api/analytics/run returns available=false with a "Bruin CLI not available on this host" reason |
| Secrets | PASS: the Runware and Telem key values are not in the public HTML or JS bundle |

**Notes:**
- `scripts/e2e-api.mjs` has one strict check that failed once: its generic strong answer scored 3 and 3 live, so difficulty stayed the same. That is LLM variance on that sample answer. Every other check passed. The README Stripe STRONG answer moved difficulty up as expected.
- `scripts/e2e-ui.mjs` ran through the scorecard (quotes, ledger with 8 rows), then timed out waiting for the Bruin adaptivity row. That's expected here: the panel shows "Bruin: not available on this host" instead. Log: [lingcode_public_ui_e2e_20261123-154502.log](lingcode_public_ui_e2e_20261123-154502.log)

## Host limits (verified)

- **Bruin:** not available. The CLI is 164 MB, and LingCode's upload cap is 5 MiB per file. Bruin is VERIFIED from the repo run only.
- **DuckDB CLI:** not available on the host.
- **Writable storage:** the app directory is read-only (container runs as nobody). Events fall back to /tmp/arena-data/events.jsonl, and a write test returned ok:true. The storage is ephemeral.
