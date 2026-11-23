/**
 * Tiny module test for server/telem.ts.
 * Loads TELEM_API_KEY from the environment or from gitignored server/.env.
 * Never prints the key.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { retrieveRoleContext } from "../../server/telem.ts";

function loadServerEnv(): void {
  const envPath = resolve(import.meta.dirname, "../../server/.env");
  let text = "";
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const name = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (process.env[name] == null || process.env[name] === "") {
      process.env[name] = value;
    }
  }
}

function redact(s: string): string {
  const key = process.env.TELEM_API_KEY;
  if (!key) return s;
  return s.split(key).join("$TELEM_API_KEY").replace(/Bearer \S+/g, "Bearer $TELEM_API_KEY");
}

loadServerEnv();

const present = Boolean(process.env.TELEM_API_KEY && process.env.TELEM_API_KEY.length > 0);
console.log(`TELEM_API_KEY_present=${present}`);

const result = await retrieveRoleContext("Stripe", "Product Data Scientist");
const safe = JSON.parse(redact(JSON.stringify(result))) as typeof result;

console.log(`ok=${safe.ok}`);
console.log(`error=${safe.error ?? ""}`);
console.log(`source_count=${safe.sources.length}`);
for (const [i, src] of safe.sources.entries()) {
  const snippet = (src.snippet || "").replace(/\s+/g, " ").slice(0, 160);
  console.log(`source_${i + 1}_title=${src.title}`);
  console.log(`source_${i + 1}_url=${src.url}`);
  console.log(`source_${i + 1}_snippet=${snippet}`);
}
