import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "..", "env.local");
try {
  const c = readFileSync(envPath, "utf-8");
  for (const l of c.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const e = t.indexOf("=");
    if (e === -1) continue;
    const k = t.slice(0, e).trim();
    const v = t.slice(e + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  const sources = ["the-island", "lankadeepa", "sunday-observer", "daily-ft", "divaina"];
  for (const slug of sources) {
    const { data: src } = await sb.from("sources").select("id,name").eq("slug", slug).single();
    if (!src) {
      console.log(slug + ": not found");
      continue;
    }
    const { count: total } = await sb.from("articles").select("*", { count: "exact", head: true }).eq("source_id", src.id);
    const { count: noDate } = await sb.from("articles").select("*", { count: "exact", head: true }).eq("source_id", src.id).is("published_at", null);
    console.log(src.name + ": " + noDate + "/" + total + " missing dates");
  }
}

main().catch(console.error);
