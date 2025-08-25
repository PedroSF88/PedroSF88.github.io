// deno run --allow-env --allow-net
// Create/Update drafts and publish lesson outlines for a topic.
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

  let body: any = {};
  try { body = await req.json(); } catch {}

  const topic_id = (body?.topic_id ?? "").toString().trim();
  const draft = body?.draft;
  const publish = Boolean(body?.publish === true);

  if (!topic_id) return json({ ok: false, error: "topic_id required" }, 400);
  if (!publish && (draft === undefined || draft === null || typeof draft !== "object")) {
    // If not publishing, we must be drafting with a JSON object
    return json({ ok: false, error: "draft object required (or set publish:true)" }, 400);
  }

  if (!publish) {
    // Save/replace draft (store in both legacy and current draft fields for compatibility)
    const { error } = await supabase
      .from("topic_teks")
      .update({
        re_lesson_outlines: draft,         // legacy field used in your codebase
        lesson_outline_draft: draft,       // optional newer draft field
      })
      .eq("id", topic_id);

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, mode: "draft" as const });
  }

  // --- Publish path ---
  // Load current draft + version
  const { data: row, error: readErr } = await supabase
    .from("topic_teks")
    .select("re_lesson_outlines, lesson_outline_draft, lesson_outline_version")
    .eq("id", topic_id)
    .maybeSingle();

  if (readErr) return json({ ok: false, error: readErr.message }, 500);
  if (!row) return json({ ok: false, error: "topic not found" }, 404);

  const draftToPublish =
    row.re_lesson_outlines ??
    row.lesson_outline_draft ??
    null;

  if (!draftToPublish) {
    return json({ ok: false, error: "no draft to publish" }, 400);
  }

  const newVersion = (row.lesson_outline_version ?? 0) + 1;
  const nowIso = new Date().toISOString();

  // Write published outline and bump version
  const { error: updErr } = await supabase
    .from("topic_teks")
    .update({
      lesson_outline: draftToPublish,
      lesson_outline_version: newVersion,
      lesson_outline_updated_by: "mygpt-actions",
      lesson_outline_updated_at: nowIso,
    })
    .eq("id", topic_id);

  if (updErr) return json({ ok: false, error: updErr.message }, 500);

  // Record a version row (best-effort: ignore conflict errors)
  const { error: verErr } = await supabase
    .from("lesson_outline_versions")
    .insert({
      topic_id,
      version: newVersion,
      outline: draftToPublish,
      created_by: "mygpt-actions",
    });

  // If version insert fails, still consider publish successful
  if (verErr) {
    console.warn("lesson_outline_versions insert failed:", verErr.message);
  }

  return json({ ok: true, mode: "published" as const });
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
