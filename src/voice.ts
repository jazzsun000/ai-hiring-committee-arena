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

function voiceFor(sp: Speaker): SpeechSynthesisVoice | undefined {
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
  u.onstart = () => on.start?.();
  u.onend = () => on.end?.();
  u.onerror = () => on.end?.();
  const go = () => { try { synth.resume(); synth.speak(u); } catch { on.end?.(); } };
  if (gesture) go(); else setTimeout(go, 50);
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
