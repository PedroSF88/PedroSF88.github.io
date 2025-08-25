// deno run --allow-env --allow-net
// Returns a single topic_teks row by id.
//
// Auth: static bearer key (ACTIONS_ADMIN_KEY) in the Authorization header.
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), ACTIONS_ADMIN_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SECRET_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ACTIONS_ADMIN_KEY = Deno.env.get("ACTIONS_ADMIN_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("", { headers: corsHeaders() });
  }

  // Auth: Authorization: Bearer <ACTIONS_ADMIN_KEY>
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token !== ACTIONS_ADMIN_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Parse body
  let body: any = {};
  try { body = await req.json(); } catch {}
  const topic_id = (body?.topic_id ?? "").toString().trim();
  if (!topic_id) return json({ ok: false, error: "topic_id required" }, 400);

  // Optional UUID sanity (non-fatal if you prefer to allow non-UUIDs)
  const uuidish = /^[0-9a-fA-F-]{36}$/;
  if (!uuidish.test(topic_id)) {
    return json({ ok: false, error: "invalid topic_id format" }, 400);
  }

  // Select columns you care about; adjust as needed
  const columns = [
    "id",
    "topic_title",
    "matched_teks",
    "lesson_core",
    "unit_id",
    "lesson_outline",
    "re_lesson_outlines",
    "lesson_outline_draft",
    "lesson_outline_version",
    "lesson_outline_updated_by",
    "lesson_outline_updated_at",
    "created_at",
    "thread_id",
    "vocab_emojis",
    "request_id",
  ].join(", ");

  const { data, error } = await supabase
    .from("topic_teks")
    .select(columns)
    .eq("id", topic_id)
    .maybeSingle();

  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, topic: data ?? null });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  } as const;
}
