// Voice via the browser's built-in Web Speech API only (speechSynthesis + SpeechRecognition).
// No keys, no sponsor service: availability and voices depend on the user's browser/OS.
export type Speaker = 'maya' | 'alex' | 'jordan';

const synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
export const ttsSupported = !!synth;

const PROFILE: Record<Speaker, { pitch: number; rate: number; prefer: RegExp; slot: number }> = {
  maya: { pitch: 1.1, rate: 1.0, prefer: /samantha|zira|karen|victoria|female|google us english/i, slot: 0 },
  alex: { pitch: 0.9, rate: 1.0, prefer: /daniel|david|fred|aaron|male|google uk english male/i, slot: 1 },
  jordan: { pitch: 1.0, rate: 1.0, prefer: /moira|tessa|serena|rishi|google uk english female/i, slot: 2 },
};

const nav = typeof navigator !== 'undefined' ? navigator : undefined;
/** iOS/iPadOS (incl. iPad with a desktop UA): assigning a custom voice can produce silence there, so we don't. */
export const isIOS = !!nav && (/iPhone|iPad|iPod/i.test(nav.userAgent) || (/Macintosh/i.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1));

// ---- On-screen voice diagnostics -------------------------------------------------------------
export interface VoiceStatus { supported: boolean; voices: number; last: string; audio: string }
let status: VoiceStatus = { supported: !!synth, voices: 0, last: '—', audio: '—' };
const listeners = new Set<(s: VoiceStatus) => void>();
function setStatus(p: Partial<VoiceStatus>) {
  status = { ...status, voices: synth?.getVoices().length ?? 0, ...p };
  listeners.forEach((l) => l(status));
}
export function onVoiceStatus(l: (s: VoiceStatus) => void) { listeners.add(l); l(status); return () => { listeners.delete(l); }; }
if (synth) { try { synth.addEventListener?.('voiceschanged', () => setStatus({})); } catch { /* ignore */ } }

function voiceFor(sp: Speaker): SpeechSynthesisVoice | undefined {
  if (isIOS) return undefined;
  const all = synth?.getVoices() ?? [];
  const en = all.filter((v) => /^en/i.test(v.lang));
  const pool = en.length ? en : all;
  if (!pool.length) return undefined;
  const others = (Object.keys(PROFILE) as Speaker[]).filter((k) => k !== sp).map((k) => PROFILE[k].prefer);
  return pool.find((v) => PROFILE[sp].prefer.test(v.name) && !others.some((r) => r.test(v.name))) ?? pool[PROFILE[sp].slot % pool.length];
}

/** Call synchronously inside a tap handler: iOS Safari only allows speech that starts from a user gesture. */
export function resumeSpeech() { try { synth?.resume(); } catch { /* ignore */ } }

export function stopSpeech() { synth?.cancel(); }

/**
 * Speak `text` as `sp`. Pass gesture=true when called directly from a click/tap handler: then speak() runs
 * synchronously (required by iOS). Otherwise a short delay after cancel() avoids the iOS bug where a speak()
 * in the same tick as cancel() is dropped. Never waits for voiceschanged; uses the default voice if none listed.
 */
export function speak(sp: Speaker, text: string, on: { start?: () => void; end?: () => void } = {}, gesture = false) {
  if (!synth || !text.trim()) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = voiceFor(sp);
  if (v) u.voice = v;
  u.lang = v?.lang || 'en-US';
  u.volume = 1;
  u.pitch = PROFILE[sp].pitch;
  u.rate = PROFILE[sp].rate;
  u.onstart = () => { setStatus({ last: `start (${sp})` }); on.start?.(); };
  u.onend = () => { setStatus({ last: `end (${sp})` }); on.end?.(); };
  u.onerror = (e) => { setStatus({ last: `error:${(e as SpeechSynthesisErrorEvent).error ?? 'unknown'} (${sp})` }); on.end?.(); };
  const go = () => { try { synth.resume(); synth.speak(u); setStatus({ last: `queued (${sp})` }); } catch (e) { setStatus({ last: `error:${(e as Error).name}` }); on.end?.(); } };
  if (gesture) go(); else setTimeout(go, 50);
}

// ---- Test voice: beep (HTMLAudioElement + inline WAV) then a default-voice utterance ----------
let beepUrl = '';
function beepDataUri(): string {
  if (beepUrl) return beepUrl;
  const rate = 22050, secs = 0.25, n = Math.floor(rate * secs);
  const buf = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) buf.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); buf.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true);
  buf.setUint32(24, rate, true); buf.setUint32(28, rate * 2, true); buf.setUint16(32, 2, true); buf.setUint16(34, 16, true);
  str(36, 'data'); buf.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const env = Math.min(1, i / 200, (n - i) / 200); buf.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 880 * i) / rate) * 0.5 * env * 32767, true); }
  let bin = ''; const bytes = new Uint8Array(buf.buffer);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  beepUrl = `data:audio/wav;base64,${btoa(bin)}`;
  return beepUrl;
}

/** Call synchronously from a tap. Plays a beep, then speaks a test line with the default voice. */
export function testVoice() {
  try {
    const a = new Audio(beepDataUri());
    a.volume = 1;
    const p = a.play();
    if (p && typeof p.then === 'function') p.then(() => setStatus({ audio: 'beep ok' }), (e: Error) => setStatus({ audio: `beep rejected: ${e?.name ?? 'error'}` }));
    else setStatus({ audio: 'beep played' });
  } catch (e) { setStatus({ audio: `beep error: ${(e as Error).name}` }); }
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = W.AudioContext ?? W.webkitAudioContext;
    if (Ctx) { const ctx = new Ctx(); void ctx.resume?.().catch(() => undefined); }
  } catch { /* secondary only */ }
  if (!synth) { setStatus({ last: 'speechSynthesis not supported' }); return; }
  try { synth.cancel(); synth.resume(); } catch { /* ignore */ }
  const u = new SpeechSynthesisUtterance('Voice test. Hello from Maya.');
  u.lang = 'en-US'; u.volume = 1; u.rate = 1; u.pitch = 1; // no u.voice: default voice
  u.onstart = () => setStatus({ last: 'start (test)' });
  u.onend = () => setStatus({ last: 'end (test)' });
  u.onerror = (e) => setStatus({ last: `error:${(e as SpeechSynthesisErrorEvent).error ?? 'unknown'} (test)` });
  try { synth.speak(u); setStatus({ last: 'queued (test)' }); } catch (e) { setStatus({ last: `error:${(e as Error).name} (test)` }); }
}

// Minimal typing for SpeechRecognition (not in the TS DOM lib everywhere).
export interface Recognizer {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: unknown) => void) | null;
  start: () => void; stop: () => void;
}
type RecognizerCtor = new () => Recognizer;
const w = (typeof window !== 'undefined' ? window : {}) as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
const Rec: RecognizerCtor | undefined = w.SpeechRecognition ?? w.webkitSpeechRecognition;
export const micSupported = !!Rec;
export function createRecognizer(): Recognizer | null {
  if (!Rec) return null;
  const r = new Rec();
  r.lang = 'en-US'; r.interimResults = true; r.continuous = true;
  return r;
}
