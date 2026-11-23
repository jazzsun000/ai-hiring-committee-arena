// Usage: node scripts/runware-probe.mjs <model> [max_tokens] [tag]  -> writes analytics/evidence/runware_call_<tag>.json/.md (key never written)
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('server/.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]));
const key = env.RUNWARE_API_KEY; const model = process.argv[2] || 'minimax:m3@0'; const max_tokens = Number(process.argv[3]||300); const tag = process.argv[4] || model.replace(/[^a-z0-9]+/gi,'_');
const endpoint = 'https://api.runware.ai/v1/chat/completions';
const body = { model, ...(model.startsWith('openai:') ? { max_completion_tokens: max_tokens, reasoning_effort: 'minimal' } : { max_tokens, temperature: 0.2 }), messages: [
 { role:'system', content:'You are Maya, a hiring manager. Reply with ONLY a JSON object {"score":1-5,"evidence":"exact quote","gap":"short"}.' },
 { role:'user', content:'Question: How would you measure whether a new onboarding flow worked?\nAnswer: """I\'d define success as 7-day activation and run an A/B test with a power calc and guardrail metrics."""' } ] };
const started = new Date(); const t0 = Date.now(); let status = 0, json = null, err = null;
try { const r = await fetch(endpoint, { method:'POST', headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }); status = r.status; json = await r.json().catch(()=>null); } catch(e) { err = String(e.message||e); }
const latency_ms = Date.now() - t0;
const content = json?.choices?.[0]?.message?.content ?? null;
const rec = { request: { endpoint, method:'POST', headers:{ Authorization:'Bearer [REDACTED]', 'Content-Type':'application/json' }, model, max_tokens, messages_count: body.messages.length }, started_at: started.toISOString(), finished_at: new Date().toISOString(), latency_ms, http_status: status, error: err,
  response_trimmed: json ? { id: json.id, model: json.model, usage: json.usage, finish_reason: json?.choices?.[0]?.finish_reason, content: content ? String(content).slice(0,600) : null, error: json.error ?? json.errors ?? undefined } : null };
let out = JSON.stringify(rec, null, 2); if (key && out.includes(key)) throw new Error('key leaked; refusing to write');
fs.mkdirSync('analytics/evidence',{recursive:true});
fs.writeFileSync(`analytics/evidence/runware_call_${tag}.json`, out+'\n');
fs.writeFileSync(`analytics/evidence/runware_call_${tag}.md`, `# Runware call evidence (${tag})\n\n- Endpoint: POST ${endpoint}\n- Model: ${model} (max_tokens ${max_tokens})\n- Started: ${rec.started_at}\n- Latency: ${latency_ms} ms\n- HTTP status: ${status}${err?`\n- Error: ${err}`:''}\n- Finish reason: ${rec.response_trimmed?.finish_reason ?? 'n/a'}\n- Usage: ${JSON.stringify(rec.response_trimmed?.usage ?? null)}\n- Authorization header: Bearer [REDACTED]\n\nTrimmed response content:\n\n\`\`\`\n${rec.response_trimmed?.content ?? JSON.stringify(rec.response_trimmed?.error ?? null)}\n\`\`\`\n`);
console.log(tag, 'status', status, 'latency_ms', latency_ms, 'finish', rec.response_trimmed?.finish_reason, 'usage', JSON.stringify(rec.response_trimmed?.usage), 'content:', (content||JSON.stringify(rec.response_trimmed?.error)||err||'').slice(0,200).replace(/\n/g,' '));
