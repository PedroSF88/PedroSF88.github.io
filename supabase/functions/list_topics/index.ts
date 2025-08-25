// deno run --allow-env --allow-net
// Lists topics (published by default) with optional unit filter, paging, and search.
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

  // Parse body (all optional)
  let body: any = {};
  try { body = await req.json(); } catch {}
  const unit_id = (body?.unit_id ?? "").toString().trim() || null;
  const includeDrafts = Boolean(body?.include_drafts ?? false);
  const limit = clamp(Number(body?.limit ?? 50), 1, 200);
  const offset = Math.max(0, Number(body?.offset ?? 0));
  const search = (body?.search ?? "").toString().trim();

  // Build query against topic_teks
  let q = supabase
    .from("topic_teks")
    .select("id, topic_title, lesson_outline, unit_id, created_at, lesson_outline_updated_at");

  if (unit_id) q = q.eq("unit_id", unit_id);
  if (!includeDrafts) q = q.not("lesson_outline", "is", null);
  if (search) q = q.ilike("topic_title", `%${search}%`);

  // Order by "most recently updated", falling back to created_at
  // (Supabase allows NULLS FIRST/LAST control)
  q = q
    .order("lesson_outline_updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false });

  // Pagination
  q = q.range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  const items = (data ?? []).map((r: any) => ({
    id: r.id,
    topic: r.topic_title ?? null,
    published: r.lesson_outline != null,
    unit_id: r.unit_id ?? null,
    updated_at: r.lesson_outline_updated_at ?? r.created_at ?? null,
  }));

  return json({ ok: true, count: items.length, items });
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

function clamp(n: number, min: number, max: number) {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
