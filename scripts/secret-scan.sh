#!/usr/bin/env bash
# Secret scan over tracked tree + full git history. Prints matches for human review; exits 1 on a real-looking hit.
cd "$(dirname "$0")/.."
fail=0
echo "== tracked .env / duckdb files =="
git ls-files | grep -E '(^|/)\.env($|\.)|duckdb' | grep -v '\.env\.example$' && fail=1 || echo "none (only .env.example allowed)"
PAT='xai-[A-Za-z0-9]{10,}|(XAI|RUNWARE|TELEM)_API_KEY=[^[:space:]]+|sk-[A-Za-z0-9]{16,}|api_key|Bearer [A-Za-z0-9._-]{12,}'
echo "== pattern hits in tracked tree (git grep) =="
git grep -nIE "$PAT" -- . ':!package-lock.json' || echo "none"
echo "== pattern hits in history (git log -p, added lines) =="
git log -p --all --no-color -- . ':!package-lock.json' | grep -E '^\+' | grep -nE "$PAT" | sed 's/^/  /' || echo "none"
echo "== high-entropy tokens (>=32 chars, mixed case+digits, Shannon entropy >= 4.0) in tracked tree =="
python3 - "$(git ls-files | grep -v package-lock.json)" <<'PYE' || true
import sys, re, math, collections
hits = 0
for f in sys.argv[1].split('\n'):
    try: txt = open(f, encoding='utf-8', errors='ignore').read()
    except Exception: continue
    for m in re.finditer(r'[A-Za-z0-9+/_=-]{32,}', txt):
        t = m.group(0)
        if not (re.search(r'[a-z]', t) and re.search(r'[A-Z]', t) and re.search(r'[0-9]', t)): continue
        c = collections.Counter(t); e = -sum(n/len(t)*math.log2(n/len(t)) for n in c.values())
        if e >= 4.0: hits += 1; print(f"  {f}: {t[:6]}…{t[-4:]} (len {len(t)}, H={e:.2f})")
print(f"  {hits} high-entropy candidate(s)")
PYE
echo "== literal check of env keys present on this box (values never printed) =="
for v in XAI_API_KEY RUNWARE_API_KEY TELEM_API_KEY; do
  val="${!v}"; [ -n "$val" ] || continue
  if git log -p --all | grep -qF "$val" || git grep -qF "$val"; then echo "$v VALUE FOUND IN REPO"; fail=1; else echo "$v value: not in tree or history"; fi
done
if [ -f server/.env ]; then
  while IFS='=' read -r k val; do
    [[ "$k" =~ ^[A-Z_]+$ && -n "$val" && ${#val} -ge 8 ]] || continue
    if git log -p --all | grep -qF "$val" || git grep -qF "$val"; then echo "server/.env $k VALUE FOUND IN REPO"; fail=1; else echo "server/.env $k value: not in tree or history"; fi
  done < server/.env
fi
echo "== remotes =="; git remote -v; [ -z "$(git remote)" ] && echo "no remotes"
exit $fail
