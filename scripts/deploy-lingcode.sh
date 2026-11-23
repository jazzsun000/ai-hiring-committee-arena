#!/usr/bin/env bash
# Deploy AI Hiring Committee Arena to LingCode Cloud (hosted-apps tier, Node runtime).
# Needs: LINGCODE_TOKEN in the environment (from https://lingcode.dev/cli-token.html) or a prior `npx lingcode login`.
# Reads RUNWARE_API_KEY / TELEM_API_KEY from server/.env or the environment; values are never printed.
set -euo pipefail
REPO=${REPO:-/workspace/ai-hiring-arena}
DEPLOY_DIR=${DEPLOY_DIR:-/workspace/arena-lingcode-deploy}
APP_NAME=${APP_NAME:-ai-hiring-arena}
LC="npx -y lingcode@0.3.0"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$REPO/analytics/evidence/lingcode_deploy_${STAMP}.log"
redact() { sed -E 's/(Bearer |token=|TOKEN=)[^ &"]+/\1[REDACTED]/g; s/[A-Za-z0-9_-]{40,}/[REDACTED]/g'; }
say() { echo "[$(date '+%F %T %Z')] $*" | tee -a "$LOG"; }

envval() { # $1 = name; server/.env wins, then process env
  local v; v=$(grep -E "^\s*$1\s*=" "$REPO/server/.env" 2>/dev/null | tail -1 | sed -E "s/^[^=]*=\s*//; s/^['\"]|['\"]\s*$//g") || true
  [ -n "$v" ] && printf %s "$v" || printenv "$1" || true
}

say "clean checkout of origin/master -> $DEPLOY_DIR"
if [ ! -d "$DEPLOY_DIR/.git" ]; then git clone -q "$REPO" "$DEPLOY_DIR"; fi
git -C "$DEPLOY_DIR" fetch -q https://github.com/jazzsun000/ai-hiring-committee-arena.git master
git -C "$DEPLOY_DIR" checkout -q -B deploy FETCH_HEAD
say "commit $(git -C "$DEPLOY_DIR" rev-parse --short HEAD)"
cd "$DEPLOY_DIR"
npm ci --no-audit --no-fund >/dev/null 2>&1
npm run -s build:host 2>&1 | tail -4 | tee -a "$LOG"

say "lingcode whoami"; $LC whoami 2>&1 | redact | tee -a "$LOG"
say "resolve production backend"
ENV_OUT=$($LC env --prod 2>&1 | redact); echo "$ENV_OUT" | grep -viE "anon|key" | tee -a "$LOG"
BACKEND=$(echo "$ENV_OUT" | grep -oE 'Production backend [^ ]+' | awk '{print $3}' | head -1)
[ -n "$BACKEND" ] || { say "could not resolve backend id"; exit 2; }
BASE=${LINGCODE_API_BASE:-https://lingcode.dev}
TOKEN=${LINGCODE_TOKEN:-$(node -e 'const f=require("os").homedir()+"/.lingcode/credentials.json";try{const s=require(f);process.stdout.write(s.accounts["https://lingcode.dev"].token)}catch{}')}
for K in RUNWARE_API_KEY TELEM_API_KEY LLM_PROVIDER RUNWARE_MODEL; do
  case $K in LLM_PROVIDER) V=runware;; RUNWARE_MODEL) V=openai:gpt@5;; *) V=$(envval $K);; esac
  [ -n "$V" ] || { say "missing $K"; exit 3; }
  CODE=$(node -e 'process.stdout.write(JSON.stringify({value:process.argv[1]}))' "$V" | curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/cloud/account/backends/$BACKEND/secrets/$K" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data-binary @-)
  say "vault secret $K -> HTTP $CODE (value not logged)"
done
say "lingcode ship --server --name $APP_NAME"
set +e; $LC ship --server --name "$APP_NAME" 2>&1 | redact | tee -a "$LOG"; RC=${PIPESTATUS[0]}; set -e
say "ship exit $RC"; echo "log: $LOG"; exit $RC
