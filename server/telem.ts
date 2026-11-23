/**
 * Telem AI retrieval for company + role interview context.
 *
 * Official API (https://docs.telem.ai/api/, https://docs.telem.ai/quickstart/):
 *   POST https://router.telem.ai/v1/search
 *   Authorization: Bearer $TELEM_API_KEY
 *
 * Telem has no dedicated job-description endpoint. Search is the documented
 * way to retrieve live job listings and interview-process pages for a company
 * and role. Result snippets live in the `summary` field of each result.
 */
const TELEM_SEARCH_URL = "https://router.telem.ai/v1/search";

export type TelemSource = {
  title: string;
  url: string;
  snippet: string;
};

export type TelemRoleContext = {
  ok: boolean;
  sources: TelemSource[];
  error?: string;
};

function redact(text: string, key?: string): string {
  let out = text;
  if (key) out = out.split(key).join("$TELEM_API_KEY");
  return out.replace(/Bearer \S+/g, "Bearer $TELEM_API_KEY");
}

function collectSources(payload: unknown): TelemSource[] {
  const sources: TelemSource[] = [];
  const seen = new Set<string>();
  const runs =
    payload && typeof payload === "object" && "preprocessor_runs" in payload
      ? (payload as { preprocessor_runs?: unknown }).preprocessor_runs
      : undefined;
  if (!Array.isArray(runs)) return sources;
  for (const run of runs) {
    if (!run || typeof run !== "object") continue;
    const results = (run as { output_payload?: { results?: unknown } }).output_payload
      ?.results;
    if (!Array.isArray(results)) continue;
    for (const row of results) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const url = typeof rec.url === "string" ? rec.url.trim() : "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title = typeof rec.title === "string" && rec.title.trim() ? rec.title.trim() : url;
      const snippet =
        (typeof rec.summary === "string" && rec.summary) ||
        (typeof rec.snippet === "string" && rec.snippet) ||
        "";
      sources.push({ title, url, snippet: snippet.trim() });
    }
  }
  return sources;
}

export async function retrieveRoleContext(
  company: string,
  role: string,
): Promise<TelemRoleContext> {
  const key = process.env.TELEM_API_KEY;
  if (!key) {
    return { ok: false, sources: [], error: "TELEM_API_KEY is not set" };
  }

  const query = `${company} ${role} job description interview process role requirements`.trim();
  if (!company.trim() || !role.trim()) {
    return { ok: false, sources: [], error: "company and role are required" };
  }

  let res: Response;
  try {
    res = await fetch(TELEM_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_input: { query },
        search: {
          providers: { include: ["exa", "brave"] },
          num_results: 5,
          tier: "default",
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, sources: [], error: redact(message, key) };
  }

  const rawText = await res.text();
  const safeText = redact(rawText, key);

  let payload: unknown;
  try {
    payload = JSON.parse(safeText);
  } catch {
    return {
      ok: false,
      sources: [],
      error: `Telem HTTP ${res.status}: response was not JSON`,
    };
  }

  const sources = collectSources(payload);
  if (!res.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? JSON.stringify((payload as { detail: unknown }).detail)
        : safeText.slice(0, 400);
    return {
      ok: false,
      sources,
      error: redact(`Telem HTTP ${res.status}: ${detail}`, key),
    };
  }

  const status =
    payload && typeof payload === "object" && "status" in payload
      ? (payload as { status?: unknown }).status
      : undefined;
  if (status && status !== "succeeded" && sources.length === 0) {
    return {
      ok: false,
      sources: [],
      error: `Telem search status was ${String(status)} with no sources`,
    };
  }

  return { ok: true, sources };
}
