// Committee v2 e2e: strong / average / weak / incomplete answers. Usage: node scripts/e2e-committee.mjs <baseUrl>
const U = process.argv[2] || 'http://localhost:8787';
const STRONG = "I'd make time-to-first-payout the north-star metric, since a merchant only gets value from Stripe once money lands in their bank account, and track KYC completion rate as the leading input metric. I'd run a randomized A/B test at the account level with a power calculation up front: with a ~40% baseline KYC completion rate and a 2-point minimum detectable effect, that's roughly 9-10k accounts per arm. I'd use CUPED with pre-signup traffic as the covariate, run an SRM check before reading results, and hold guardrails on fraud/dispute rate, support tickets and payment failure rate. I'd also segment by country, because KYC requirements differ.";
const AVERAGE = "I'd look at activation rate, like the share of new accounts that process a first payment within a week, and run an A/B test comparing old and new onboarding. I'd make sure the sample is big enough and check that the difference is statistically significant before launching, and also watch support tickets.";
const WEAK = "I'd just compare revenue before and after the change. If revenue went up, it worked. Maybe look at a dashboard.";
const INCOMPLETE = "Not sure.";
const RECS = ['strong_hire', 'hire', 'no_hire', 'strong_no_hire'];
const post = async (p, b) => { const r = await fetch(U + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const t = await r.text(); if (!r.ok) throw new Error(p + ' ' + r.status + ' ' + t.slice(0, 200)); return JSON.parse(t); };
let fail = 0; const check = (ok, m) => { console.log((ok ? 'PASS ' : 'FAIL ') + m); if (!ok) fail++; };
async function run(name, answers) {
  const s = await post('/api/session', { company: 'Stripe', role: 'Product Data Scientist' });
  for (let i = 0; i < answers.length; i++) {
    await post('/api/answer', { session_id: s.session_id, answer: answers[i] });
    if (i < answers.length - 1) await post('/api/next', { session_id: s.session_id });
  }
  const c = await post('/api/scorecard', { session_id: s.session_id }); const k = c.committee;
  console.log(`\n== ${name} (mode ${s.mode}) final=${k.final.recommendation} [${k.final.source}] votes=${k.votes.map((v) => `${v.agent}:${v.initial}->${v.revised}`).join(' ')} status=${k.assessment_status} follow_up=${k.follow_up_question ? 'yes' : 'no'}`);
  console.log('   rationale:', k.final.rationale.slice(0, 220));
  check(RECS.includes(k.final.recommendation) && k.votes.every((v) => RECS.includes(v.initial) && RECS.includes(v.revised)) && RECS.includes(c.recommendation), `${name}: only 4-level recommendations`);
  check(k.initial.every((e) => e.source === 'llm') && k.final.source === 'llm', `${name}: interviewers + chair are live LLM`);
  check(k.votes.length === 2 && k.revisions.length === 2, `${name}: initial + revised votes preserved`);
  check(k.final.rationale.length > 20 && /not a majority/i.test(k.final.not_majority_note), `${name}: chair rationale present, not majority`);
  check(/Simulated interview feedback/.test(k.label), `${name}: simulated-feedback label`);
  check(Array.isArray(k.improvement_plan) && k.improvement_plan.length > 0, `${name}: improvement plan`);
  return k;
}
const ks = await run('STRONG', [STRONG]);
const ka = await run('AVERAGE', [AVERAGE]);
const kw = await run('WEAK', [WEAK]);
const ki = await run('INCOMPLETE', [INCOMPLETE]);
check(['strong_hire', 'hire'].includes(ks.final.recommendation), 'STRONG -> hire or strong_hire');
check(['no_hire', 'strong_no_hire'].includes(kw.final.recommendation), 'WEAK -> no_hire or strong_no_hire');
check(ki.assessment_status === 'insufficient_evidence' && !['hire', 'strong_hire'].includes(ki.final.recommendation), 'INCOMPLETE -> insufficient_evidence status, not hire');
console.log('AVERAGE final:', ka.final.recommendation);
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
