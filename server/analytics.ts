// Runs the PM-owned Bruin pipeline (read-only use of analytics/) and reads marts via the duckdb CLI.
import { execFile } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ANALYTICS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'analytics');
const DB = path.join(ANALYTICS, 'arena.duckdb');
const PATH_ENV = `${process.env.PATH}:${os.homedir()}/.local/bin`;
let running: Promise<unknown> | null = null;

export const BRUIN_UNAVAILABLE_REASON = 'Bruin CLI not available on this host; pipeline evidence comes from the repo run (analytics/evidence/bruin_run.log).';
let bruinAvailable: boolean | null = null;
/** True only when both the bruin and duckdb CLIs can be executed on this host. */
export async function bruinOnHost(): Promise<boolean> {
  if (bruinAvailable !== null) return bruinAvailable;
  try {
    await run('bruin', ['--version'], ANALYTICS, 15000);
    await run('duckdb', ['--version'], ANALYTICS, 15000);
    bruinAvailable = true;
  } catch { bruinAvailable = false; }
  return bruinAvailable;
}

function run(cmd: string, args: string[], cwd: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, PATH: PATH_ENV, XAI_API_KEY: '', RUNWARE_API_KEY: '', TELEM_API_KEY: '' } }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${path.basename(cmd)} failed${err.killed ? ' (timeout)' : ''}: ${(stderr || stdout || err.message).trim().split('\n').slice(-4).join(' | ').slice(0, 400)}`));
      else resolve(stdout);
    });
  });
}

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const out = await run('duckdb', ['-no-agent', '-readonly', '-json', DB, '-c', sql], ANALYTICS, 15000).catch(() =>
    run('duckdb', ['-readonly', '-json', DB, '-c', sql], ANALYTICS, 15000));
  const t = out.trim();
  return t ? (JSON.parse(t) as Record<string, unknown>[]) : [];
}

export async function runAnalytics(sessionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error('invalid session_id');
  if (!(await bruinOnHost())) {
    return { ok: false, available: false, reason: BRUIN_UNAVAILABLE_REASON, ms: 0, session_id: sessionId, session_trend: [], candidate_summary: null };
  }
  while (running) await running.catch(() => undefined);
  const started = Date.now();
  const p = run('bash', ['./run_pipeline.sh'], ANALYTICS, 90000);
  running = p;
  try { await p; } finally { running = null; }
  const trend = await query(`SELECT round, avg_score, difficulty, difficulty_rank, prev_difficulty, difficulty_rose, prior_round_high_score, adaptivity FROM marts.session_trend WHERE session_id = '${sessionId}' ORDER BY round`);
  const summary = (await query(`SELECT * FROM marts.candidate_summary WHERE session_id = '${sessionId}'`))[0] ?? null;
  return { ok: true, available: true, ms: Date.now() - started, session_id: sessionId, session_trend: trend, candidate_summary: summary };
}
