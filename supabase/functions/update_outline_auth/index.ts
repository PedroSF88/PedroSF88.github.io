// deno run --allow-env --allow-net
// Save/publish a topic outline but ONLY for authenticated/allowed users.
// No admin key needed in the browser. Keep ACTIONS_ADMIN_KEY out of the client.
//
// ENV required:
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY     (service role; used for the actual write)
//   SUPABASE_PUBLISHABLE_KEY (to read auth user from JWT)
// Optional ENV:
//   ALLOWED_EMAIL_DOMAIN       (e.g., "school.org")
//   ALLOWED_EDITOR_EMAILS      (comma-separated list, e.g., "a@x.com,b@y.org")

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
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Admin client (bypasses RLS for the write)
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  // CORS + preflight
  if (req.method === "OPTIONS") {
    return new Response("", { headers: corsHeaders() });
  }

  // Must have Authorization: Bearer <user_jwt>
  const authHeader = req.headers.get("authorization") || "";
  if (!/^Bearer\s+/i.test(authHeader)) {
    return json({ ok: false, error: "Missing bearer token" }, 401);
  }

  // Create a user-scoped client to read the user info
  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) {
    return json({ ok: false, error: "Invalid or expired token" }, 401);
  }

  const user = authData.user;
  const email = (user.email || "").toLowerCase();
  if (!isAllowedEmail(email)) {
    return json({ ok: false, error: "Forbidden (not allowed to edit)" }, 403);
  }

  // Parse body
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const topic_id = (body?.topic_id ?? "").toString().trim();
  const draft = body?.draft;
  const publish = body?.publish === true;

  if (!topic_id) return json({ ok: false, error: "topic_id required" }, 400);
  if (!publish && (draft === undefined || draft === null || typeof draft !== "object")) {
    return json({ ok: false, error: "draft object required (or set publish:true)" }, 400);
  }

  // Save draft
  if (!publish) {
    const { error } = await admin
      .from("topic_teks")
      .update({
        re_lesson_outlines: draft,
        lesson_outline_draft: draft,
        lesson_outline_updated_by: email,
        lesson_outline_updated_at: new Date().toISOString(),
      })
      .eq("id", topic_id);

    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, mode: "draft" });
  }

  // Publish
  const { data: row, error: readErr } = await admin
    .from("topic_teks")
    .select("re_lesson_outlines, lesson_outline_draft, lesson_outline_version")
    .eq("id", topic_id)
    .maybeSingle();

  if (readErr) return json({ ok: false, error: readErr.message }, 500);
  if (!row) return json({ ok: false, error: "topic not found" }, 404);

  const draftToPublish = row.re_lesson_outlines ?? row.lesson_outline_draft ?? null;
  if (!draftToPublish) return json({ ok: false, error: "no draft to publish" }, 400);

  const newVersion = (row.lesson_outline_version ?? 0) + 1;
  const nowIso = new Date().toISOString();

  const { error: updErr } = await admin
    .from("topic_teks")
    .update({
      lesson_outline: draftToPublish,
      lesson_outline_version: newVersion,
      lesson_outline_updated_by: email,
      lesson_outline_updated_at: nowIso,
    })
    .eq("id", topic_id);

  if (updErr) return json({ ok: false, error: updErr.message }, 500);

  // Version history (best-effort)
  await admin.from("lesson_outline_versions").insert({
    topic_id,
    version: newVersion,
    outline: draftToPublish,
    created_by: email,
  });

  return json({ ok: true, mode: "published" });
});

function isAllowedEmail(email: string) {
  if (!email) return false;
  if (ALLOWED_EDITOR_EMAILS.includes(email)) return true;
  if (ALLOWED_EMAIL_DOMAIN && email.endsWith("@" + ALLOWED_EMAIL_DOMAIN)) return true;
  return ALLOWED_EMAIL_DOMAIN === "" && ALLOWED_EDITOR_EMAILS.length === 0
    ? false // if you configured neither, default DENY
    : false;
}

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
  };
}
