import { useEffect, useMemo, useRef, useState } from 'react';
import { Arena, DecisionLedger, Scorecard, QuestionChip, AgentChip, SourcesPanel, AGENTS } from './components/arena';
import type { AgentId, AvatarState, LedgerRow, DifficultyDelta } from './components/arena';
import { BruinPanel, type BruinResult } from './components/BruinPanel';
import { speak, stopSpeech, resumeSpeech, ttsSupported, micSupported, createRecognizer, type Recognizer, type Speaker } from './voice';
import { api, type Assessment, type Health, type Question, type ScorecardData, type Source } from './api';

const DEFAULT_ROUNDS = 2;
const DIFF_NUM = { easy: 2, medium: 3, hard: 4 } as const;
const COMPANIES = ['Stripe', 'Airbnb', 'Netflix', 'DoorDash', 'Spotify'];
const ROLES = ['Product Data Scientist', 'Data Scientist, Experimentation', 'Product Analyst'];

type Phase = 'setup' | 'asking' | 'scoring' | 'deciding' | 'between' | 'finishing' | 'done';
interface RoundView { question: Question; answer?: string; assessments?: Assessment[] }

const deltaOf = (q: Question): DifficultyDelta => (q.trend === 'up' ? 'up' : q.trend === 'down' ? 'down' : 'same');
const reactState = (score?: number): AvatarState => (score == null ? 'idle' : score >= 4 ? 'pleased' : score <= 2 ? 'concerned' : 'idle');

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [company, setCompany] = useState(COMPANIES[0]);
  const [role, setRole] = useState(ROLES[0]);
  const [phase, setPhase] = useState<Phase>('setup');
  const [sessionId, setSessionId] = useState('');
  const [rounds, setRounds] = useState<RoundView[]>([]);
  const [targetRounds, setTargetRounds] = useState(DEFAULT_ROUNDS);
  const [draft, setDraft] = useState('');
  const [voiceOn, setVoiceOn] = useState(false);
  const [speaking, setSpeaking] = useState<Speaker | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognizer | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [card, setCard] = useState<ScorecardData | null>(null);
  const [error, setError] = useState<{ msg: string; retry: () => void } | null>(null);
  const [bruin, setBruin] = useState<{ data: BruinResult | null; loading: boolean; error: string | null }>({ data: null, loading: false, error: null });
  const [bruinVerified, setBruinVerified] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const scorecardRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { api.health().then((h) => { console.info('[arena] provider health:', h.reason); setHealth(h); }).catch(() => setHealth({ ok: false, mode: 'demo', reason: 'backend unreachable', model: null })); }, []);
  useEffect(() => { if (phase === 'asking') answerRef.current?.focus(); }, [phase, rounds.length]);
  useEffect(() => { if (sessionId) localStorage.setItem('arena:last', JSON.stringify({ sessionId, company, role, rounds, ledger, card })); }, [sessionId, rounds, ledger, card, company, role]);

  useEffect(() => { const el = ledgerRef.current?.querySelector('.ledger-list'); if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [ledger.length]);
  useEffect(() => { if (card) scorecardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [card]);
  const current = rounds[rounds.length - 1];
  const addLedger = (row: Omit<LedgerRow, 'time' | 'id'>) => setLedger((l) => [...l, { ...row, time: new Date(), id: `${l.length}` }]);
  const questionLedger = (q: Question) => {
    addLedger({ agent: 'jordan', round: q.round, decision: `Next: ${AGENTS[q.asker].name} · ${q.topicLabel} · ${q.difficulty}`, reason: q.reason });
  };

  async function guard(fn: () => Promise<void>, retry: () => void) {
    setError(null);
    try { await fn(); } catch (e) { setError({ msg: (e as Error).message, retry }); }
  }

  const start = () => guard(async () => {
    setLedger([]);
    setPhase('deciding');
    setSources([]); setSourcesLoading(true);
    const r = await api.start(company, role).finally(() => setSourcesLoading(false));
    setSources(r.context?.sources ?? []);
    if (r.context?.sources?.length) addLedger({ agent: 'jordan', round: 0, decision: `Retrieved ${r.context.sources.length} role sources (Telem)`, reason: 'Context retrieved at interview start to ground the opening question.' });
    setSessionId(r.session_id); setRounds([{ question: r.question }]); setCard(null); setTargetRounds(DEFAULT_ROUNDS);
    questionLedger(r.question);
    setPhase('asking');
  }, () => start());

  const finish = (sid = sessionId) => guard(async () => {
    setPhase('finishing');
    api.event({ session_id: sid, type: 'decision', agent: 'jordan', round: rounds.length, reason: 'Interview ended via Finish interview; writing scorecard', text: 'finish' });
    const c = await api.scorecard(sid);
    setCard(c);
    addLedger({ agent: 'jordan', round: c.rounds, decision: `Scorecard: ${c.recommendation.replace(/_/g, ' ')} (${c.overall}/5)`, reason: `Average of ${c.rounds * 2} independent scores; quotes taken verbatim from answers.` });
    setPhase('done');
    runBruin(sid);
  }, () => finish(sid));

  async function runBruin(sid: string) {
    setBruin({ data: null, loading: true, error: null });
    try {
      const data = await api.analytics(sid);
      setBruin({ data, loading: false, error: null });
      if (data.ok && data.session_trend.length > 0) setBruinVerified(true);
    } catch (e) { setBruin({ data: null, loading: false, error: (e as Error).message }); }
  }

  const nextQuestion = () => guard(async () => {
    setPhase('deciding');
    const { question } = await api.next(sessionId);
    setRounds((rs) => [...rs, { question }]);
    questionLedger(question);
    setPhase('asking');
  }, () => nextQuestion());

  const submit = () => guard(async () => {
    const answer = draft.trim();
    if (!answer || !current) return;
    setPhase('scoring');
    setRounds((rs) => rs.map((r, i) => (i === rs.length - 1 ? { ...r, answer } : r)));
    const { assessments } = await api.answer(sessionId, answer);
    setRounds((rs) => rs.map((r, i) => (i === rs.length - 1 ? { ...r, assessments } : r)));
    for (const a of assessments) addLedger({ agent: a.agent, round: current.question.round, decision: `Scored ${a.score}/5`, reason: a.gap });
    setDraft('');
    if (rounds.length >= targetRounds) { setPhase('between'); return; }
    setPhase('deciding');
    const { question } = await api.next(sessionId);
    setRounds((rs) => [...rs, { question }]);
    questionLedger(question);
    setPhase('asking');
  }, () => (current?.assessments ? nextQuestion() : submit()));

  const plusOne = () => { setTargetRounds((t) => t + 1); api.event({ session_id: sessionId, type: 'decision', agent: 'jordan', round: rounds.length, reason: 'Presenter requested +1 round', text: 'plus_one' }); nextQuestion(); };
  const restart = () => { setSources([]); setBruin({ data: null, loading: false, error: null }); setPhase('setup'); setRounds([]); setLedger([]); setCard(null); setSessionId(''); setDraft(''); setError(null); };

  // Avatar states driven by the flow.
  const last = current?.assessments;
  const scoreOf = (id: AgentId) => last?.find((a) => a.agent === id)?.score;
  const { activeAgent, states, statusLabels, bubble } = useMemo(() => {
    const base: Record<AgentId, AvatarState> = { maya: 'idle', alex: 'idle', jordan: 'idle' };
    if (phase === 'scoring') return { activeAgent: null, states: { maya: 'thinking', alex: 'thinking', jordan: 'thinking' } as Record<AgentId, AvatarState>, statusLabels: { maya: 'Scoring…', alex: 'Scoring…', jordan: 'Waiting for scores…' }, bubble: undefined };
    if (phase === 'deciding' || phase === 'finishing') {
      const s = { ...base, maya: reactState(scoreOf('maya')), alex: reactState(scoreOf('alex')), jordan: 'thinking' as AvatarState };
      return { activeAgent: null, states: s, statusLabels: { jordan: phase === 'finishing' ? 'Writing scorecard…' : 'Deciding next question…' }, bubble: undefined };
    }
    if (phase === 'asking' && current) {
      const prev = rounds[rounds.length - 2]?.assessments;
      const s = { ...base };
      if (prev) { s.maya = reactState(prev.find((a) => a.agent === 'maya')?.score); s.alex = reactState(prev.find((a) => a.agent === 'alex')?.score); }
      s[current.question.asker] = 'speaking';
      return { activeAgent: current.question.asker as AgentId, states: s, statusLabels: undefined, bubble: current.question.text };
    }
    if (phase === 'between' || phase === 'done') {
      return { activeAgent: phase === 'done' ? ('jordan' as AgentId) : null, states: { maya: reactState(scoreOf('maya')), alex: reactState(scoreOf('alex')), jordan: phase === 'done' ? 'speaking' : 'idle' } as Record<AgentId, AvatarState>, statusLabels: undefined, bubble: phase === 'done' && card ? `Recommendation: ${card.recommendation.replace(/_/g, ' ')}. Scorecard below.` : undefined };
    }
    return { activeAgent: null, states: base, statusLabels: undefined, bubble: undefined };
  }, [phase, current, rounds, card]);

  // Voice (browser Web Speech API): read each new interviewer message aloud; avatar shows Speaking while it plays.
  const spokenText = phase === 'asking' && current ? current.question.text : phase === 'done' && card ? `Recommendation: ${card.recommendation.replace(/_/g, ' ')}. Overall ${card.overall} out of 5. ${card.summary}` : '';
  const spokenBy: Speaker | null = phase === 'asking' && current ? current.question.asker : phase === 'done' && card ? 'jordan' : null;
  useEffect(() => {
    if (!voiceOn || !spokenText || !spokenBy) return;
    speak(spokenBy, spokenText, { start: () => setSpeaking(spokenBy), end: () => setSpeaking((cur) => (cur === spokenBy ? null : cur)) });
  }, [voiceOn, spokenText, spokenBy]);
  useEffect(() => { if (phase !== 'asking') stopMic(); }, [phase]);
  // With voice on, "Speaking" follows real utterance start/end events only.
  const shownStates: Record<AgentId, AvatarState> = voiceOn
    ? (Object.fromEntries((Object.keys(states) as AgentId[]).map((id) => [id, id === speaking ? 'speaking' : states[id] === 'speaking' ? 'idle' : states[id]])) as Record<AgentId, AvatarState>)
    : states;
  const voiceEvents = (sp: Speaker) => ({ start: () => setSpeaking(sp), end: () => setSpeaking((cur) => (cur === sp ? null : cur)) });
  const toggleVoice = () => {
    if (voiceOn) { stopSpeech(); setSpeaking(null); setVoiceOn(false); return; }
    // Audible utterance inside the tap itself unlocks iOS speech for later (non-gesture) questions.
    setVoiceOn(true);
    const sp: Speaker = spokenBy ?? 'jordan';
    speak(sp, spokenText || 'Voice on.', voiceEvents(sp), true);
  };
  const replay = (sp: Speaker, text: string) => speak(sp, text, voiceEvents(sp), true);
  const gestureKick = () => { if (voiceOn) resumeSpeech(); };
  const bubbleNode = bubble ? (
    <>
      {bubble}
      {ttsSupported && activeAgent && <><br /><button type="button" className="btn replay-btn" data-testid="replay-bubble" onClick={() => replay(activeAgent as Speaker, spokenText || String(bubble))}>🔊 Replay</button></>}
    </>
  ) : undefined;
  function stopMic() { recRef.current?.stop(); recRef.current = null; setListening(false); }
  const toggleMic = () => {
    if (listening) return stopMic();
    const r = createRecognizer();
    if (!r) return;
    stopSpeech();
    const base = draft ? draft.replace(/\s*$/, ' ') : '';
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setDraft(base + text.trim());
    };
    r.onend = () => { setListening(false); recRef.current = null; };
    r.onerror = () => { setListening(false); recRef.current = null; };
    recRef.current = r; setListening(true);
    try { r.start(); } catch { setListening(false); recRef.current = null; }
  };

  const busyLine = phase === 'scoring' ? 'Maya & Alex are scoring…' : phase === 'deciding' ? 'Jordan is deciding the next question…' : phase === 'finishing' ? 'Jordan is writing the scorecard…' : '';
  const live = health?.mode === 'live';

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>AI Hiring Committee Arena</h1>
          <p className="muted tagline">3 AI interviewers. Adaptive questions. Every decision explained.</p>
        </div>
        <div className="header-pills">
        {bruinVerified && <span className="bruin-pill" data-testid="bruin-pill" title="Every answer, score and decision piped through a Bruin pipeline into DuckDB marts">Bruin analytics</span>}
        {ttsSupported && <button type="button" className={`btn voice-toggle${voiceOn ? ' primary' : ''}`} onClick={toggleVoice} aria-pressed={voiceOn} data-testid="voice-toggle" title="Interviewers speak using your browser's built-in speech (Web Speech API)">{voiceOn ? '🔊 Voice on' : '🔇 Voice off'}</button>}
        <span className={`mode-badge ${live ? 'mode-badge--live' : 'mode-badge--demo'}`} data-testid="mode-badge" >
          {health ? (live ? 'LIVE · Runware' : 'DEMO') : '…'}
        </span>
        </div>
      </header>
      {health && !live && (
        <div className="demo-banner" data-testid="demo-banner">
          {import.meta.env.VITE_STATIC_DEMO === '1'
            ? 'Static demo: deterministic scoring, recorded Telem sources. LIVE version runs agents on Runware.'
            : health.llm_active && health.endpoint === 'test-override'
              ? 'TEST MODE · mock LLM endpoint (not a real provider call)'
              : 'DEMO MODE · deterministic rule-based scorer (no live LLM call)'}
        </div>
      )}

      <Arena
        activeAgent={activeAgent}
        states={shownStates}
        bubble={bubbleNode}
        statusLabels={statusLabels}
        caption={current ? `Round ${current.question.round} of ${targetRounds} · ${company} · ${role}` : 'Maya (Hiring Manager) · Alex (Technical) · Jordan (Evaluator)'}
      />

      {current && phase !== 'setup' && (
        <div className="question-meta" data-testid="question-chip">
          <QuestionChip topic={current.question.topicLabel} difficulty={DIFF_NUM[current.question.difficulty]} delta={deltaOf(current.question)} reason={current.question.reason} highlightKey={current.question.round} />
        </div>
      )}

      {busyLine && <div className="busy" role="status" data-testid="busy">{busyLine}</div>}
      {error && (
        <div className="error-box" role="alert">Something went wrong: {error.msg} <button onClick={error.retry}>Retry</button></div>
      )}

      <main className="layout">
        <section className="panel main-panel">
          {phase === 'setup' && (
            <div className="setup">
              <label>Company<select value={company} onChange={(e) => setCompany(e.target.value)} data-testid="company">{COMPANIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label>Role<select value={role} onChange={(e) => setRole(e.target.value)} data-testid="role">{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
              <button className="btn primary" onClick={() => { gestureKick(); start(); }} data-testid="start">Start interview</button>
            </div>
          )}

          {phase !== 'setup' && (
            <>
              <div className="transcript">
                {rounds.map((r) => (
                  <div key={r.question.round} className="turn">
                    <div className="turn-q"><AgentChip agent={r.question.asker} /> <span className="muted">R{r.question.round}</span> {r.question.text}{ttsSupported && <> <button type="button" className="btn replay-btn" data-testid={`replay-q-${r.question.round}`} onClick={() => replay(r.question.asker, r.question.text)} aria-label="Replay question">🔊 Replay</button></>}</div>
                    {r.answer && <div className="turn-a"><b>You:</b> {r.answer}</div>}
                    {r.assessments && (
                      <div className="scores">
                        {r.assessments.map((a) => (
                          <div key={a.agent} className={`score-chip score-chip--${a.score >= 4 ? 'good' : a.score <= 2 ? 'low' : 'mid'}`} data-testid={`score-${a.agent}-${r.question.round}`}>
                            <AgentChip agent={a.agent} /> <b>{a.score}/5</b> <q>{a.evidence}</q> <span className="muted">Gap: {a.gap}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {phase === 'asking' && (
                <div className="answer-box">
                  <textarea ref={answerRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type your answer…" rows={6} data-testid="answer" />
                  <div className="answer-actions">
                    {micSupported && <button type="button" className={`btn mic-btn${listening ? ' primary' : ''}`} onClick={toggleMic} aria-pressed={listening} data-testid="mic" title="Dictate with your browser's speech recognition">{listening ? '⏹ Stop dictation' : '🎤 Speak answer'}</button>}
                    <button className="btn primary" onClick={() => { gestureKick(); stopMic(); submit(); }} disabled={!draft.trim()} data-testid="submit">Submit answer</button>
                  </div>
                </div>
              )}
              {phase === 'between' && (
                <div className="between">
                  <p>{rounds.length} rounds complete.</p>
                  <button className="btn primary" onClick={() => finish()} data-testid="see-scorecard">See scorecard</button>
                  <button className="btn" onClick={plusOne} data-testid="plus-one">+1 round</button>
                </div>
              )}
              <div className="controls">
                {phase !== 'done' && <button className="btn" onClick={() => finish()} disabled={phase === 'finishing' || !rounds.some((r) => r.assessments)} data-testid="finish" title={!rounds.some((r) => r.assessments) ? 'Answer at least one question first' : ''}>Finish interview</button>}
                <button className="btn ghost" onClick={restart} data-testid="restart">Restart</button>
              </div>
            </>
          )}

          {card && (
            <div data-testid="scorecard" ref={scorecardRef}>
              <Scorecard candidate="Candidate" role={card.role} company={card.company} skills={card.skills} recommendation={card.recommendation} summary={card.summary} overall={card.overall} />
              <div className="panel quotes" data-testid="quotes">
                <p className="overline">In your own words</p>
                {[...new Set(card.quotes)].map((q) => <blockquote key={q}>“{q}”</blockquote>)}
              </div>
              <BruinPanel data={bruin.data} loading={bruin.loading} error={bruin.error} onRetry={() => runBruin(sessionId)} />
            </div>
          )}
        </section>
        <aside className="side-col">
          <div ref={ledgerRef} data-testid="ledger"><DecisionLedger rows={ledger} /></div>
          {(sourcesLoading || phase !== 'setup') && <div data-testid="sources"><SourcesPanel sources={sources} provider={import.meta.env.VITE_STATIC_DEMO === '1' ? 'Telem · recorded snapshot' : 'Telem'} loading={sourcesLoading} /></div>}
        </aside>
      </main>
    </div>
  );
}
