// Minimal save/publish with a single admin token (no JWT).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // or SUPABASE_SECRET_KEY
const ADMIN_TOKEN  = Deno.env.get("ACTIONS_ADMIN_KEY")!;         // <- set this in function env

const db = createClient(SUPABASE_URL, SERVICE_KEY);

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}
function j(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...cors() } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: cors() });

  // Single shared admin token (simple!)
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== ADMIN_TOKEN) return j({ ok: false, error: "Forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return j({ ok: false, error: "Invalid JSON" }, 400); }

  const topic_id = String(body?.topic_id || "").trim();
  const publish  = body?.publish === true;
  const draft    = body?.draft;
  const schema_version = Number(body?.schema_version || 2);
  const isV2 = schema_version === 2;

  if (!topic_id) return j({ ok: false, error: "topic_id required" }, 400);
  if (!publish && (draft == null || typeof draft !== "object"))
    return j({ ok: false, error: "draft object required (or set publish:true)" }, 400);

  const now = new Date().toISOString();

  if (!publish) {
    const upd = isV2
      ? { lesson_outline_v2_draft: draft, lesson_outline_updated_by: "admin", lesson_outline_updated_at: now }
      : { re_lesson_outlines: draft, lesson_outline_draft: draft, lesson_outline_updated_by: "admin", lesson_outline_updated_at: now };

    const { error } = await db.from("topic_teks").update(upd).eq("id", topic_id);
    if (error) return j({ ok: false, error: error.message }, 500);
    return j({ ok: true, mode: "draft", schema_version });
  }

  const sel = await db.from("topic_teks").select(
    "re_lesson_outlines, lesson_outline_draft, lesson_outline_version," +
    "lesson_outline_v2, lesson_outline_v2_draft, lesson_outline_v2_version"
  ).eq("id", topic_id).maybeSingle();

  if (sel.error) return j({ ok: false, error: sel.error.message }, 500);
  const row = sel.data;
  if (!row) return j({ ok: false, error: "topic not found" }, 404);

  const draftToPublish = isV2
    ? (row.lesson_outline_v2_draft ?? row.lesson_outline_v2 ?? null)
    : (row.re_lesson_outlines ?? row.lesson_outline_draft ?? null);

  if (!draftToPublish) return j({ ok: false, error: "no draft to publish" }, 400);

  const newVersion = (isV2 ? (row.lesson_outline_v2_version ?? 0) : (row.lesson_outline_version ?? 0)) + 1;

  const updPub = isV2
    ? { lesson_outline_v2: draftToPublish, lesson_outline_v2_version: newVersion, lesson_outline_updated_by: "admin", lesson_outline_updated_at: now }
    : { lesson_outline:     draftToPublish, lesson_outline_version:     newVersion, lesson_outline_updated_by: "admin", lesson_outline_updated_at: now };

  const u = await db.from("topic_teks").update(updPub).eq("id", topic_id);
  if (u.error) return j({ ok: false, error: u.error.message }, 500);

  await db.from("lesson_outline_versions").insert({
    topic_id, version: newVersion, outline: draftToPublish, created_by: "admin", schema_version
  });

  return j({ ok: true, mode: "published", schema_version });
});
