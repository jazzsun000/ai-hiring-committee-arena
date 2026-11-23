// Test-only fake OpenAI-compatible server to exercise the live code path (JSON parsing/repair, validation, fallbacks).
// Usage: node scripts/mock-xai.mjs 8799   then run the API with XAI_BASE_URL=http://localhost:8799/v1 XAI_API_KEY=test
import http from 'node:http';
let n = 0;
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const msgs = JSON.parse(body).messages;
    const sys = msgs[0].content; const user = msgs[1].content;
    n++;
    let content;
    if (/Return \{"ok": true\}/.test(user)) content = '{"ok": true}';
    else if (/You are (Maya|Alex)/.test(sys)) {
      const ans = (user.match(/"""([\s\S]*)"""/) || [, ''])[1];
      const strong = ans.length > 300;
      const first = ans.split(/(?<=\.)\s/)[0];
      // wrap in code fences + trailing comma to exercise repair
      content = '```json\n{"score": ' + (strong ? 5 : 1) + ', "evidence": ' + JSON.stringify(first) + ', "gap": "' + (strong ? 'Could quantify long-term effects.' : 'No counterfactual or identification strategy.') + '",}\n```';
    } else if (/next question/.test(sys)) {
      const strong = /"score":5/.test(user);
      content = JSON.stringify(strong
        ? { next_agent: 'alex', topic: 'causal', difficulty: 'hard', question: 'LLM: How would you estimate the effect of a staggered pricing rollout without randomization?', reason: 'LLM: Raised difficulty: candidate cited power calc + guardrails.' }
        : { next_agent: 'alex', topic: 'causal', difficulty: 'medium', question: 'LLM: What would a good counterfactual be here?', reason: 'LLM: Probing causal basics at lower difficulty: no counterfactual.' });
    } else {
      content = '{"summary": "LLM summary.", "quotes": ["this phrase was never typed", "also invented"]}'; // invented quotes -> must be replaced
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
}).listen(Number(process.argv[2] || 8799), () => console.log('mock xai up'));
