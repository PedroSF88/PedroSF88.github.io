// Save/publish a topic outline for authenticated/allowed users.
// Supports schema_version 1 (current) and 2 (new parallel columns).
// Requires valid user JWT (verify_jwt=true). Writes with service role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_EMAIL_DOMAIN = (Deno.env.get("ALLOWED_EMAIL_DOMAIN") || "").toLowerCase().trim();
const ALLOWED_EDITOR_EMAILS = (Deno.env.get("ALLOWED_EDITOR_EMAILS") || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  // CORS / preflight
  if (req.method === "OPTIONS") return new Response("", { headers: cors() });

  const authHeader = req.headers.get("authorization") || "";
  if (!/^Bearer\s+/i.test(authHeader)) return j({ ok:false, error:"Missing bearer token" }, 401);

  // user-scoped client to read user from JWT
  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) return j({ ok:false, error:"Invalid or expired token" }, 401);

  const email = String(authData.user.email || "").toLowerCase();
  if (!isAllowed(email)) return j({ ok:false, error:"Forbidden (not allowed to edit)" }, 403);

  // Body
  let body: any = {};
  try { body = await req.json(); } catch { return j({ ok:false, error:"Invalid JSON body" }, 400); }

  const topic_id = String(body?.topic_id || "").trim();
  const publish = body?.publish === true;
  const draft = body?.draft;
  const schema_version = Number(body?.schema_version || 1);
  const isV2 = schema_version === 2;

  if (!topic_id) return j({ ok:false, error:"topic_id required" }, 400);
  if (!publish && (draft === undefined || draft === null || typeof draft !== "object"))
    return j({ ok:false, error:"draft object required (or set publish:true)" }, 400);

  const nowIso = new Date().toISOString();

  // Save draft
  if (!publish) {
    const upd = isV2
      ? { lesson_outline_v2_draft: draft, lesson_outline_updated_by: email, lesson_outline_updated_at: nowIso }
      : { re_lesson_outlines: draft,   lesson_outline_draft: draft,   lesson_outline_updated_by: email, lesson_outline_updated_at: nowIso };

    const { error } = await admin.from("topic_teks").update(upd).eq("id", topic_id);
    if (error) return j({ ok:false, error:error.message }, 500);
    return j({ ok:true, mode:"draft", schema_version });
  }

  // Publish
  const { data: row, error: rErr } = await admin
    .from("topic_teks")
    .select("re_lesson_outlines, lesson_outline_draft, lesson_outline_version, lesson_outline_v2, lesson_outline_v2_draft, lesson_outline_v2_version")
    .eq("id", topic_id)
    .maybeSingle();
  if (rErr) return j({ ok:false, error:rErr.message }, 500);
  if (!row) return j({ ok:false, error:"topic not found" }, 404);

  const draftToPublish = isV2
    ? (row.lesson_outline_v2_draft ?? row.lesson_outline_v2 ?? null)
    : (row.re_lesson_outlines ?? row.lesson_outline_draft ?? null);
  if (!draftToPublish) return j({ ok:false, error:"no draft to publish" }, 400);

  const newVersion = (isV2 ? (row.lesson_outline_v2_version ?? 0) : (row.lesson_outline_version ?? 0)) + 1;
  const updPub = isV2
    ? { lesson_outline_v2: draftToPublish, lesson_outline_v2_version: newVersion, lesson_outline_updated_by: email, lesson_outline_updated_at: nowIso }
    : { lesson_outline:     draftToPublish, lesson_outline_version:     newVersion, lesson_outline_updated_by: email, lesson_outline_updated_at: nowIso };

  const { error: uErr } = await admin.from("topic_teks").update(updPub).eq("id", topic_id);
  if (uErr) return j({ ok:false, error:uErr.message }, 500);

  // Snapshot
  await admin.from("lesson_outline_versions").insert({
    topic_id,
    version: newVersion,
    outline: draftToPublish,
    created_by: email,
    schema_version,
  });

  return j({ ok:true, mode:"published", schema_version });
});

function isAllowed(email: string) {
  if (!email) return false;
  if (ALLOWED_EDITOR_EMAILS.includes(email)) return true;
  if (ALLOWED_EMAIL_DOMAIN && email.endsWith("@"+ALLOWED_EMAIL_DOMAIN)) return true;
  return false; // default deny
}

function j(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}
function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}




